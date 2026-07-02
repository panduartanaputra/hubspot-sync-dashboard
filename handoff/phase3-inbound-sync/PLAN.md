# Phase 3 — HubSpot Inbound Sync + Consent UX (Cockpit Prototype)

**Status:** In progress.
- ✅ Step 1 (schema changes) — migration `phase3_hubspot_inbound_sync_foundation` (4 new tables + `sync_config`/`granted_scopes` on `hubspot_connections`).
- ✅ Step 2 (token-refresh hardening) — migration `phase3_hubspot_connection_reauth_flags` (`reauth_required`/`reauth_reason`/`reauth_at`); `shared/connection.ts` hardened (5-min proactive buffer, `ReauthRequiredError` + `reauth_required` flagging, optional `clientId` tenant-scoping, skips flagged connections). Deployed: push-lead-to-hubspot v15, backfill-hubspot v6 (both verify_jwt=false). Verified live: expired token on connection 89f7c7cd refreshed cleanly, reauth stayed false.
- ✅ Step 3 (consent screen + dynamic scopes) — code-complete, typecheck-clean, scope logic unit-verified (17/17 assertions on real compiled source). Migration `phase3_oauth_states_sync_config` (`sync_config` on `hubspot_oauth_states`). New: `lib/hubspotScopes.ts` (scope catalog + `buildAuthScopeParams`/`normalizeSyncConfig`/`droppedOptionalScopes`), `components/ConnectSyncModal.tsx` (push/pull consent UI). Edited: `app/api/hubspot/connect/route.ts` (dynamic scope+optional_scope from `?config=`, stash choices on state row), `app/api/hubspot/callback/route.ts` (persist `sync_config`+`granted_scopes`, clear reauth flags on reconnect), `components/ConnectionStatus.tsx` (Connect → modal → popup with config).
  - **ACTION REQUIRED (user):** optional scopes are project-managed, NOT editable in the HubSpot web UI. Already edited `hubspot-app/salesos-sync/src/app/app-hsmeta.json` → `optionalScopes` now lists `crm.objects.companies.read`, `crm.objects.companies.write`, `crm.schemas.companies.write`, `crm.objects.owners.read`, `crm.objects.line_items.read`. DEPLOY PENDING: run `hs project upload` from `hubspot-app/salesos-sync` on a machine with the HubSpot CLI authed to the SalesOS Sandbox dev account (not installed on the Windows box). Existing connections don't retroactively gain optional scopes — reconnect via the new consent screen to acquire them. (push meetings/notes/tasks + pull contacts/deals need NO new scope — covered by locked scopes, governed by sync_config.)
  - **Local verification limit:** `next dev`/preview can't run against the `G:` Google Drive mount (Next `.next` writes hang). Visual/redirect verification deferred to Vercel preview deploy or user's machine. Core scope logic verified standalone.
- ✅ Step 4 (inbound pull) — **DESIGN CORRECTION**: pulled data lands in a dedicated per-connection mirror `public.hubspot_mirror` (migration `phase3_hubspot_mirror`), NOT in `*_enrichments`. Rationale: enrichment tables attach to our shared cross-tenant `persons`/`organizations`, which would absorb the client's data + risk cross-tenant bleed — violating the golden rule ("mirror, don't absorb; don't steal"). Mirror is isolated by `connection_id`, never writes to internal tables; `matched_entity_*` is an optional soft pointer only. (`opportunity_enrichments` from Step 1 now unused for inbound — harmless.) New edge fn `pull-from-hubspot` v1 (backfill via list, incremental via search on `hs_lastmodifieddate`, per-object `hubspot_sync_jobs` + `hubspot_sync_state`, 50-page/5k safety cap logged not silent). Verified live: pulled 27 contacts (25 soft-matched to persons by email) + 67 deals (17 matched to opportunities by deal id); re-run pulled 0 (incremental, no dupes).
- ✅ Step 5 (webhook hardening) — `hubspot-webhook` v8: ack <5s + async via `EdgeRuntime.waitUntil`, dedupe by `(portal_id,event_id)` in `hubspot_webhook_events`, per-connection OAuth token (not static env). Existing deal-status round-trip preserved. Verified: signature verify active (401 fast on unsigned), dedup unique-constraint enforced.
- ✅ Step 6 (disconnect + retention) — disconnect route soft-deletes mirror (immediate hide); reconnect within grace restores (callback clears `deleted_at`); `purge_hubspot_mirror(grace_days)` fn + daily cron `purge-hubspot-mirror` (03:00 UTC, 30-day grace) — verified active; `/api/hubspot/purge` + "Purge now" button (grace 0). Callback now also triggers `pull-from-hubspot` on connect. UI: reauth banner (reads `reauth_required`), dropped-optional-scope note, purge-now affordance.
- ⏳ **Deferred (needs your decision):** scheduled *polling* cron to keep the mirror fresh between connects. Needs the service-role key in cron SQL — embed vs. vault secret is a hygiene decision. Today the mirror refreshes on connect + on-demand invoke; the deal-status webhook covers live stage changes. Not blocking.
- ⏳ Not yet pushed to GitHub/Vercel (edge-fn source under `hubspot-sync/edge-functions/`, deployed via Supabase MCP; dashboard code under `hubspot-sync-dashboard/`).
- Deployed edge fns this phase: push-lead-to-hubspot v15, backfill-hubspot v6, pull-from-hubspot v1, hubspot-webhook v8.
**Host:** Cockpit — Supabase project `ttqiesrxpmcduigjiovm` (personal / Mini Pandu Dev), repo `panduartanaputra/hubspot-sync-dashboard` (personal), Vercel `hubspot-sync-dashboard`.
**Port target:** ATLAS METIS app (separate Supabase, company GitHub `PORTFOLIO PLAY/ATLAS-METIS`). This cockpit build is a faithful prototype of the feature that will later be ported into METIS — built to make that port as low-risk as possible.

---

## Goal

Extend the existing one-way HubSpot integration (app → client CRM) to also **pull** data **from** the client CRM into the app, so the app becomes a **hub**: the client works in one place instead of two. The user chooses, at connect time, what gets pushed and what gets pulled (user-selectable optional OAuth scopes).

## Golden rule (non-negotiable)

**We never overwrite the client's native CRM fields, and we never overwrite our native app records with pulled CRM data.**
- Inbound (pulled) CRM data lands in **separate, source-tagged tables** (`source='hubspot'`), isolated per connection/tenant. It is shown alongside app data in the UI ("hub" view) but stays physically separate on disk.
- Outbound writeback (see "Parked") goes only into clearly-labeled destinations, never native CRM fields.
- **Exception, deliberate and pre-existing:** the `hubspot-webhook` "status round-trip" reflects manual HubSpot deal-stage changes onto native `opportunities`/`meetings` status (guarded by `last_change_source='hubspot_inbound'`). This is the return-half of the outbound push feature, scoped to *deal status only*. It is NOT the general inbound-mirror and must not be confused with it.

---

## Decisions locked

1. **Consent UX** — pre-OAuth screen in our dashboard with two checkbox groups ("push into your HubSpot" / "pull from your HubSpot"); we assemble `scope=` (required/locked) + `optional_scope=` (user-selected) dynamically, then redirect to HubSpot. After callback, inspect the token's actually-granted scopes and surface any silently-dropped ones.
2. **Push scopes** — locked: Contacts, Deals, Meetings. Optional: Companies, Notes, Tasks (all the optional push scopes offered).
3. **Pull objects (v1)** — user picks from: Contacts, Companies, Deals, Owners, Line items (all optional).
4. **Sync model** — initial backfill on connect + webhooks for ongoing near-real-time; hourly polling fallback for object types HubSpot doesn't webhook (Notes, Tasks). Ack webhooks <5s, process async, dedupe by `(portal_id, event_id)`.
5. **Conflict / hub model** — CRM data mirrors into separate tables; never overwrites native records (golden rule). No back-and-forth overwriting.
6. **Retention on disconnect** — soft-delete mirror data immediately (hidden from UI); 30-day grace period for accidental disconnect/reconnect; hard-delete after 30 days; "Purge now" button for immediate deletion. Reconnect within grace window restores instead of re-downloading.
7. **Per-field direction control** — NOT in v1 (Pattern B). Object-level opt-in only, sensible built-in defaults. Advanced per-field mapper deferred to v2; nothing in v1 blocks adding it later.
8. **Token refresh** — proactive refresh ~5 min before expiry; on `invalid_grant`/refresh failure, flag connection `reauth_required`, do NOT retry, show reconnect banner + email owner once.
9. **Tenancy naming (Option A)** — new tables use `client_id` (cockpit-consistent, joins cleanly with existing tables). **PORT STEP: rename `client_id` → `client_org_id` when moving to METIS.** See "Port checklist".
10. **Multi-pipeline routing — DEFERRED to v2 (user confirmed "eventually").** Today the connection holds ONE `pipeline_id` + ONE `stage_map`; all pushed deals go to that single pipeline. v2 needs: per-pipeline stage maps (keyed by pipeline_id) PLUS a routing rule deciding which opportunity lands in which pipeline. Per-pipeline maps are meaningless without the routing rule (a deal lives in only one pipeline). The pipeline list is refreshable on demand (↻ Refresh in PipelineMapper) without reconnect.

   **HubSpot pipeline model (why this matters — general knowledge, for completeness):**
   - Pipelines are **account/portal-level and shared**, NOT per-user. Nobody "owns" a pipeline.
   - By default **every user sees all pipelines** (the Deals-board pipeline dropdown). Restricting a user/team to specific pipelines requires **Sales Hub Professional/Enterprise "pipeline permissions"** (admin-configured); on Free/Starter everyone sees all.
   - Per-person distinction is **record ownership** (each deal/contact has an **Owner** user), not pipeline. Reps filter to "My deals" on ownership.

   **Therefore the routing key is almost certainly the HubSpot Owner.** v2 routing = "lead/opportunity → pipeline" decided by owner (owner→pipeline map) or by a cockpit segment field (type/product/source). This is the SAME feature as pulling **Owners** (already a consent pull option) — routing needs Owner data. Capture both together.

   **Current-state caveat (v1, live now):** the stage-map fallback (`DEFAULT_STAGES`) uses HubSpot's *default* Sales Pipeline internal stage IDs. Selecting a **custom** pipeline (e.g. "2026 Win") and leaving stages on "— default —" can make pushes fail (those stage IDs don't exist in the custom pipeline). On FIRST connect the callback auto-picks the default pipeline + auto-seeds the stage map by label heuristic, so standard accounts "just work"; the risk is only manual selection of a custom pipeline. Suggested safeguard (not yet built): block saving a non-default pipeline that still has unmapped statuses (Option A).

   **To build v2, the product inputs required from the user (see session 2026-07-01):** (a) the routing rule — what decides which pipeline a lead goes to (Owner-based? a cockpit segment/type field? manual per-lead?); (b) each pipeline's intended purpose (e.g. Sales Pipeline = new business, 2026 Win = renewals); (c) if owner-based, the owner→pipeline (or owner→segment) mapping + enable Owners pull; (d) confirm where the routing key lives in the cockpit opportunity model. Technical pieces (pull each pipeline's stages, store per-pipeline maps, UI) are on our side.

11. **Adjust sync scope after connect ("Edit sync") — DEFERRED to v2.** Today the consent screen only appears on Connect; once connected there's NO in-place way to change what syncs. To adjust, the user must disconnect → reconnect → re-tick (which overwrites `sync_config` + `granted_scopes`). Two cases: (a) toggling an object whose scope is ALREADY granted (e.g. Contacts pull — `contacts.read` is locked/always granted) needs only a `sync_config` flip, NO re-auth — but there's no UI for it today; (b) adding an object needing a NEW scope (Companies/Owners/Line-items) genuinely requires OAuth re-consent. Planned fix: an "Edit sync" button in the connected panel that re-opens the consent modal pre-filled from current `sync_config`; on save, PATCH `sync_config` directly when no new scope is needed, else run OAuth re-consent (no disconnect). Closes the usability gap where even an already-granted toggle forces a full disconnect/reconnect.

12. **Optional PUSH objects not yet built (Companies / Notes / Tasks) — DEFERRED to v2.** Audit (session 2026-07-01): of the consent options, ALL 5 PULL objects (contacts, companies, deals, owners, line_items) are fully built (mirror into `hubspot_mirror`); on PUSH only the 3 LOCKED objects work (Contacts, Deals, Meetings). The 3 OPTIONAL push objects are shown in the consent UI but are currently no-ops:
    - **Push Companies** — adapter only sets a `company` *text property* on the contact; it does NOT create a real HubSpot Company *record* or associate it. So "Primary Company" stays blank and no firmographics push. To build: find-or-create Company by **domain** (dedupe) → associate to contact + deal. Inputs needed: which company fields to push; whether enriched data goes to `metis_*` company props (needs companies schema scope) vs standard fields.
    - **Push Notes** — no note creation exists. **This IS the parked writeback decision (Option B = notes).** Inputs needed: note content (enrichment summary / agent findings / verification) + when it's written. Blocked on the writeback rule.
    - **Push Tasks** — no task creation exists. Inputs needed: what generates a task (does the app produce follow-up items at all?), task content, due date, assignee (owner).
    - **UX decision (user, 2026-07-01):** KEEP all three visible in the consent UI (not hidden), build them out in v2. Interim honesty option (not taken): a "coming soon" tag on unbuilt options.

13. **Push opportunity OWNER → HubSpot deal owner — DEFERRED to v2 (user request 2026-07-02).** METIS opportunities carry an **owner** (a METIS user, e.g. shown on the Opportunities page). When an opp reaches a synced status and we create/update its HubSpot deal, also set the deal's `hubspot_owner_id` to that owner — **but only if the deal has no owner yet** (never overwrite a rep's manual assignment; golden rule). **Dependency:** HubSpot owners are the CLIENT's HubSpot users, not METIS users — so we must MAP METIS owner → HubSpot owner by **email**, which requires the **Owners pull** (to know the client's HubSpot user list). **Open sub-question:** when the METIS owner has NO matching user in the client's HubSpot (likely for agency/PORTFOLIO PLAY staff), fall back to **Unassigned** or to a **designated client rep**? — product call, same owner-key as multi-pipeline routing (item 10). Consider applying to the associated contact's owner too.

## Writeback rule — DECIDED (2026-07-02), build is v2

**Decision:** agent enrichment for **both Contacts and Companies/Accounts** is written into the client's CRM as **Metis-branded custom timeline events** — NOT custom fields, NOT plain notes.
- **Why not custom fields:** creating custom properties needs `crm.schemas.*.write` (admin-level schema change) — clients typically refuse. Custom timeline events need NO client admin: the event template is defined ONCE on our app; it flows to every connected portal automatically, appears under Activities → Custom events, branded "Metis" + logo.
- **Trade-off accepted:** timeline events are per-record activity (not filterable list columns / not reportable). The rich, queryable enrichment lives in Metis (the hub); HubSpot gets the per-record human-readable surface. Custom fields remain a "nice to have only if a given client's admin allows it," not the baseline.
- **Persistence on disconnect (confirmed):** what Metis wrote INTO the client's CRM (timeline events, created records) STAYS — the client keeps it. We only purge OUR mirror of data we PULLED from them, after the 30-day grace. Golden rule: their CRM data is theirs; our mirror is ours.
- **Build status:** v2. Ties directly to "Build Push Companies/Notes/Tasks" (item 12) — Notes/enrichment ⇒ timeline events; and to renaming the app "Metis" (below) so events attribute correctly.

## App branding — DONE / in progress (2026-07-02)

- App `name` renamed `SalesOS Sync` → **"Metis"** + description updated in `hubspot-app/salesos-sync/src/app/app-hsmeta.json`. **Deploy pending:** `hs project upload` from that dir. This is what the consent screen + all activity attribution ("…from Metis") show.
- **Logo:** square high-res Metis "MM" mark to be uploaded in the HubSpot **developer portal → app settings** (manual UI step; logos are not set in the project code). User provided the asset 2026-07-02.

## Parked (awaiting user's team decision)

_(Writeback rule resolved — see above. Nothing else currently parked awaiting the team.)_

---

## What already exists in the cockpit (reuse, don't rebuild)

- `hubspot_connections` (23 cols): `scopes[]`, `destination`, `disconnected_at`, `properties_provisioned_at`, `provisioning_log`, `pipeline_id`, `stage_map`, `pipelines_cache`. → extend, don't replace.
- `hubspot_oauth_states`: OAuth handshake plumbing. → reuse as-is.
- `sync_log` (per-action outbound + inbound log): action/status/payloads/error/duration.
- `organization_enrichments` + `person_enrichments`: **the cockpit's multi-source landing zone** — `source`, `payload` (jsonb), `fetched_at`, `promoted_at`, `agent_run_id`. This is the cockpit's analog of METIS `entity_field_values`. Pulled HubSpot contact/company data lands here with `source='hubspot'`.
- `opportunities.{hubspot_contact_id,hubspot_deal_id,pushed_to_hubspot_at,last_synced_at,last_change_source}`, `meetings.{hubspot_meeting_id,last_change_source}`: inline ID mapping + direction tracking already seeded.
- `hubspot-webhook` edge function: existing deal-stage round-trip (see golden-rule exception).
- `push-lead-to-hubspot`, `backfill-hubspot` edge functions + `shared/connection.ts` (token refresh).

## New DB objects (additive only — breaks nothing existing)

1. **`opportunity_enrichments`** — faithful twin of `organization_enrichments`/`person_enrichments` (`source`, `payload`, `fetched_at`, `promoted_at`, `agent_run_id`). Lets pulled HubSpot *deal* data mirror non-destructively, matching the multi-source pattern for all three CRM objects.
2. **`hubspot_webhook_events`** — logs every inbound notification; unique `(portal_id, event_id)` for dedupe; status for async processing + replay.
3. **`hubspot_sync_state`** — per-connection, per-object high-water mark (last pulled at / cursor) for incremental backfill + hourly polling fallback.
4. **`hubspot_sync_jobs`** — per-run tracking of backfill/import runs (direction, object type, counts, errors). (`sync_log` stays per-record.)
5. **`hubspot_connections` additions** — `sync_config` (jsonb: user's push/pull object choices), `granted_scopes` (text[]: what HubSpot actually granted vs requested).

All new tables carry `client_id`. **RLS finding:** the cockpit has RLS *disabled* on every `public` table and has no tenancy helper functions — so the new tables also have RLS disabled, matching their siblings. Adding RLS + tenancy helpers is a METIS-port step, not a cockpit step (see port checklist).

## Application logic (the real work)

- **Consent screen** (dashboard pre-OAuth): two-group checkbox UI → dynamic scope assembly.
- **OAuth callback**: store `sync_config` + inspect/store `granted_scopes`; surface dropped scopes.
- **`pull-from-hubspot`** (new edge fn): backfill on connect + incremental pull → lands into `*_enrichments` with `source='hubspot'`.
- **`hubspot-webhook` hardening**: ack <5s + async; dedupe by `(portal_id,event_id)` via `hubspot_webhook_events`; use per-connection OAuth token instead of static `HUBSPOT_TOKEN`. Keep existing status round-trip behavior.
- **Token refresh hardening** (`shared/connection.ts`): 5-min buffer, proactive; `reauth_required` flag on refresh failure; make resolution tenant-aware (per `client_id`) rather than single `limit 1`.
- **Disconnect + purge**: soft-delete mirror on disconnect; 30-day grace; cron hard-delete; "Purge now" button; restore-on-reconnect.

## Build sequence (each step independently verifiable; additive-first)

1. Migrations (new tables + columns) — additive, safe.
2. Token-refresh hardening — small, high-value, testable immediately.
3. Consent screen + callback — dynamic scopes.
4. `pull-from-hubspot` + backfill.
5. `hubspot-webhook` hardening + ongoing sync.
6. Disconnect/purge flow.
7. Writeback — parked, plugs in later.

---

## Port checklist (cockpit → METIS)

- [ ] Rename `client_id` → `client_org_id` across all new tables + queries/edge-fn code.
- [ ] Map cockpit `organization_enrichments`/`person_enrichments`/`opportunity_enrichments` → METIS `entity_field_values` (single multi-source table with `field_name`/`value`/`source`/`source_confidence`/`is_canonical`). Cockpit uses per-entity enrichment tables; METIS uses one unified table — the landing logic must be re-pointed.
- [ ] **Add RLS on all new tables** using METIS tenancy helpers (`auth_user_accessible_tenants`, `auth_user_is_admin`, `app.tenant_id`). The cockpit ships these tables with RLS OFF (matching its siblings); METIS requires RLS ON — this must be added at port time, it is not carried over from the cockpit.
- [ ] Re-check METIS schema at cut-over (evolves fast — 180+ migrations) for drift.
- [ ] Re-create Supabase secrets (HubSpot OAuth client id/secret/app id) + cron in the METIS project.
- [ ] Verify the golden-rule exception (status round-trip) is still desired in METIS, or drop it there.

## Research basis

Design mirrors industry-standard behavior verified via deep research (Common Room, HubSpot native SF connector, HubSpot developer docs): tiered scopes + `optional_scope`, backfill + webhooks (ack <5s, dedupe by eventId, at-least-once), namespaced custom-property writeback, per-field direction as the eventual advanced model, GDPR storage-limitation purge on disconnect. Full report + verified claims retained in session history (2026-07-01).
