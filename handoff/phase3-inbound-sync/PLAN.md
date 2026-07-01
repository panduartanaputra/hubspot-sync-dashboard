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

## Parked (awaiting user's team decision)

- **Writeback rule** — Option A: if `crm.schemas.*.write` granted, provision a set of `metis_*`/source-labeled custom properties on connect and write agent-generated data only into those; Option B (fallback if schema scope declined): write everything as timestamped Notes tagged with the source. Either way, native fields are never touched. **Not being implemented until the team lands this.** Current outbound push logic (v13) stays untouched.

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
