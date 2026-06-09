# Domain & Inbox Cockpit — Explainer

This is a one-page mental model for what `/hypertide` does, who talks to whom, and which buttons are real vs. simulation-only.

If you only read one thing, read **The cast** and **The three lifecycle triggers** below — everything else hangs off those.

> 📝 **If something in the cockpit isn't covered here, or the explanation doesn't match what you're seeing on screen, don't try to reverse-engineer it.** Drop it as a feedback note for Pandu — anything goes: "this button isn't explained", "the doc says X but the UI shows Y", "I don't understand why the order is stuck in this state", "what happens if I click this during a wind-down?". Even half-formed questions are useful — they tell us what the doc + UI still need to cover. A short note in Slack, a comment on the PR, or a line in the next stand-up is enough.

---

## Contents

**Narrative (start here):**
- [What this cockpit is for](#what-this-cockpit-is-for)
- [The cast — the five systems involved](#the-cast)
- [The three lifecycle triggers](#the-three-lifecycle-triggers)
- [Onboarding (Trigger 1)](#onboarding-trigger-1--answering-how-does-purchasing-run) · [Warm-up](#warm-up--the-14-day-smartlead-timer) · [Smartlead](#smartlead--answering-where-does-the-smartlead-relationship-happen) · [Email send path](#how-emails-are-sent-out--answering-how-is-the-email-being-sent) · [Replacement (Trigger 2)](#replacement-trigger-2--when-a-domain-decays) · [Cancellation / Offboarding (Trigger 3)](#cancellation--offboarding-trigger-3--the-24h-wind-down)
- [Sim mode vs production](#sim-mode-vs-production) · [State machine](#state-machine-reference)

**Hands-on:**
- [Driving the simulation — step-by-step tutorial](#driving-the-simulation--step-by-step-tutorial)

**Reference (look up specifics):**
- [UI tour — every section of the cockpit screen](#ui-tour--every-section-of-the-cockpit-screen)
- [Database schema](#database-schema-hypertide_app) · [Edge Functions](#edge-functions-reference) · [Cron jobs](#cron-jobs) · [Mocking system](#mocking-system) · [Secrets](#secrets)
- [Deployment & stack](#deployment--stack) · [What lives where (file map)](#what-lives-where) · [Glossary](#glossary)

**Q&A and gaps:**
- [FAQ — 17 questions you'll probably also ask](#faq--questions-youll-probably-also-ask)
- [Open threads (what's not done yet)](#open-threads-whats-not-done-yet)
- [TL;DR for a stand-up](#tldr-for-a-stand-up)

---

## What this cockpit is for

We rent cold-outreach inboxes from **Hypertide** in batches called **domain orders**. Each order is one purchased domain (e.g. `try-acmedemo.com`) plus a small fleet of mailboxes on top (john.smith@…, jane.doe@…). Two plan types:

- **Outlook** — Microsoft Entra-backed mailboxes (internally still labelled `entra` to match Hypertide's API)
- **Google** — Google Workspace mailboxes (one of these is the admin user)

The cockpit is the operator's single screen for the full lifecycle of those orders — onboarding new domains, watching them warm up, replacing them when they decay, and cleanly winding them down at the end.

---

## The cast

Five systems talk to each other. Knowing which one owns what is the key to making sense of every button.

| System | What it owns |
|---|---|
| **Hypertide** | The actual domain purchase, mailbox provisioning, and the "Send-As" relay that lets us send from those mailboxes via their infrastructure. We hit their API for orders + their support inbox for the Send-As config request. |
| **Smartlead** | The warm-up engine and the sending engine. Once a mailbox is provisioned, we hand it to Smartlead and Smartlead handles the 14-day warm-up plus the actual cold-email sending afterwards. |
| **Unipile** | The unified inbox aggregator. Once a mailbox is provisioned, we connect it to Unipile so replies land in one place. |
| **Our Supabase** (`hypertide_app` schema) | The source of truth for everything the cockpit shows — orders, mailboxes, pending actions, integrations, metrics, job log. 11 tables, all RLS-enabled. |
| **The cockpit (this app)** | A Next.js front-end + a fleet of Supabase Edge Functions that orchestrate the others. No business logic lives in the UI — the UI just renders state and calls Edge Functions. |

---

## The three lifecycle triggers

Every interesting flow in the cockpit is one of three things:

1. **Onboarding** — an operator wants more inboxes for a client → buy a new domain + provision mailboxes
2. **Replacement** — an existing domain's reply-rate is decaying → wind it down + buy a fresh one
3. **Offboarding** — the client is leaving → wind down everything they own

Below is what each one looks like step by step.

---

## Onboarding (Trigger 1) — answering "How does purchasing run?"

1. Operator opens `/hypertide`, picks a client, scans the **ONBOARD NEW** form, and types one or two new domains (Outlook field, Google field, or both). They get inline warnings if the domain is burned (previously retired for this client), already used by another active order, or non-`.com`.
2. Operator confirms in the in-app modal → frontend calls Edge Function **`hypertide-create-onboarding`**.
3. That function:
   - inserts a row in `domain_orders` per plan (`status='pending_payment'`)
   - hits Hypertide's `POST /orders` in **`purchase_domain_for_me`** mode — Hypertide picks/registers the domain on our behalf (we don't go to a registrar ourselves)
   - opens an `APPROVE PAYMENT` pending action
4. Operator clicks **APPROVE PAYMENT** → **`hypertide-approve-payment`** charges via Hypertide's `POST /payments/charge`, status flips → `paid`, then Hypertide kicks off provisioning on their side.
5. Hypertide takes a few hours to provision. We poll them via **`hypertide-poll-orders`** (in production this is a 15-min cron — currently disabled, so the `POLL ORDERS` button drives it manually). When their API reports `status='done'`:
   - Order flips → `done_pre_unipile`
   - We hit `POST /domains/generate-user-credentials-csv` to pull the mailbox list
   - Mailbox rows are inserted in `mailboxes` with creds
   - Three pending actions open per order:
     - `select_master` — operator picks which mailbox is the master inbox (this becomes the visible "from" sender for Send-As)
     - `request_send_as` — confirms we've emailed Hypertide support to set up the Send-As relay
     - `connect_unipile` — connects the master inbox to Unipile
6. Operator clicks **SET MASTER** with their picked address → email to Hypertide support is what makes Send-As work.
   - **Today (simulation):** that email is sent manually. The cockpit opens a `request_send_as` action and the operator clicks **MARK REQUESTED** to close it once they've sent the email.
   - **In production:** SET MASTER will auto-send the email; the `request_send_as` action + `MARK REQUESTED` button stop existing.
7. Hypertide replies confirming Send-As is configured → operator clicks **CONFIRM** on the `confirm_send_as` action.
8. **Unipile connect** — once a mailbox is ready, we register it with Unipile so replies land in our unified inbox. **Today (simulation):** operator clicks **STUB CONNECT** with a Success/Fail dropdown to exercise both paths. **In production:** this happens automatically post-provisioning; the button + dropdown stop existing.
9. **Smartlead handoff** — once the mailbox is connected to Unipile and Send-As is confirmed, the mailbox is handed to Smartlead to start its 14-day warm-up. See [Smartlead](#smartlead--answering-where-does-the-smartlead-relationship-happen) below.

> The order's status walks: `pending_payment` → `paid` → `provisioning` → `done_pre_unipile` → `done`.

---

## Warm-up — the 14-day Smartlead timer

- Smartlead runs a **fixed 14-day warm-up** per mailbox, regardless of how many mailboxes a domain has. A domain with 4 mailboxes still takes ~14 days because they warm in parallel.
- We don't trust Smartlead's `warmup-stats` endpoint to tell us "complete" because it only returns 7-day metrics with no clean boolean. Instead we **store `smartlead_warmup_started_at` per mailbox locally** and treat it as complete when `now - started > 14 days`.
- **`hypertide-check-warmup`** (button **CHECK WARMUP**, also runs hourly in production via a disabled cron) sweeps every mailbox, flips `smartlead_warmup_completed_at` where the timer has elapsed, and rolls the result up into the **WARMUP** column on the orders table. A domain shows `WARMING · 3/4` until all four of its mailboxes have crossed the line.
- **FAST-FORWARD WARMUP (15d)** is simulation-only: it backdates `warmup_started_at` by 15 days on every mailbox of the active client so the next CHECK WARMUP marks them complete immediately. No production equivalent — in production the timer just runs.

---

## Smartlead — answering "Where does the Smartlead relationship happen?"

Smartlead is the **only** system that actually sends and warms email. The cockpit touches Smartlead in exactly two places:

1. **Warm-up tracking** — described above. Smartlead does the warming; we track elapsed time locally.
2. **Removal at end-of-life** — when an order is winding down (cancellation or offboarding), every mailbox on it must be removed from Smartlead so it stops being part of active sending. This happens inside **`hypertide-smartlead-remove`**, which is fired by `finalize-cancellations`. Real API integration is wired (`smartlead_api_key` lives in Supabase Vault).

> Open question carried over from the prior session: it's not confirmed whether Smartlead's API truly exposes `DELETE /email-accounts/{id}`. If they don't, we'll pivot to "disable warmup + remove from campaigns" as the fallback. Tracked in next-step.

Smartlead does **not** appear during onboarding or during the active sending phase from the cockpit's perspective — the cockpit only knows about warm-up state and removal. Day-to-day campaign management happens in Smartlead's own UI.

---

## How emails are sent out — answering "How is the email being sent?"

There are two distinct kinds of "email" in this system:

| Email type | Sent by | Triggered by |
|---|---|---|
| **Outreach emails** (the actual cold emails to leads) | **Smartlead**, through each mailbox, after that mailbox has finished its 14-day warm-up | Smartlead campaigns — not driven from this cockpit |
| **Send-As setup request** (an internal email to Hypertide support asking them to configure the Send-As relay so we can send *from* the new domain) | The operator (today, manually); in production this will be auto-sent by the cockpit | `select_master` action being resolved |

**The send path for a real outreach email** looks like:
```
Smartlead campaign
   → outbound through Smartlead's sending infrastructure
   → relayed via Hypertide's Send-As (which is why we need the "request_send_as" + "confirm_send_as" handshake)
   → final hop: the recipient's mail server
```

The cockpit does not see individual outreach sends. It only sees orders, mailboxes, warm-up progress, and replies (via Unipile in a separate part of the platform).

---

## Replacement (Trigger 2) — when a domain decays

1. **`hypertide-tick`** (button **TICK SIMULATION**, in production a nightly 02:00 UTC cron — disabled) advances the simulated clock by one day for the active client.
2. Each tick generates a mock reply-rate per active domain. Real values would come from Smartlead's analytics; in simulation it starts ~4% and decays ~0.1pp/day with random noise.
3. SQL helper `propose_replacements` checks each domain: if its **7-day average reply-rate is below 1.5%**, a `replacement_jobs` row opens.
4. If the client is **within `monthly_limit_usd`** (set per-client in `billing_config`), the replacement is auto-approved. If not, a `replace_approve` pending action opens for the operator.
5. **REPLACEMENT NEEDED** nudge auto-opens to surface that a coverage gap exists.
6. **Open work:** the auto-execution of an approved replacement (i.e. spawning a new domain order automatically) is **not yet built**. APPROVE REPLACE today just marks the job approved and prompts the operator to onboard a replacement manually via the ONBOARD NEW form.

---

## Cancellation / Offboarding (Trigger 3) — the 24h wind-down

This is the most subtle flow because it's deliberately **delayed** so REVERT is safe.

- **DEACTIVATE** on a single `done` order → status → `cancelling`, `cancellation_scheduled_at = now`. Nothing else happens yet. The order is still functional for 24h.
- **REVERT** during the 24h window → clean, full undo. Order flips back to `done`. No orphan state because nothing actually changed.
- **OFFBOARD CLIENT** at the client level does the same DEACTIVATE on every active order in one call.
- After 24h, **`hypertide-finalize-cancellations`** fires (hourly cron in production — disabled — manually via **FINALIZE CANCELLATIONS** in the cockpit; in simulation the button can force-finalize regardless of timer). Per order, finalize does three things atomically:
  1. **Smartlead removal** — every mailbox of the order is removed from Smartlead (see Smartlead section)
  2. **Unipile disconnect** — the master inbox is unregistered from Unipile
  3. **Status flip** — `cancelling` → `cancelled`, and Hypertide's `POST /subscriptions/cancel` is called so they stop billing us
- If Smartlead removal fails, a `remove_from_smartlead` pending action is opened for retry. The order still transitions to `cancelled`.
- The domain joins the client's **BURNED DOMAINS** list so the onboarding form warns if anyone tries to re-buy it.

> Why a domain is "locked" while cancelling: the onboarding form treats both `active` and `cancelling` states as a filled slot for that plan, but with **different labels**: `(already active)` vs `(cancelling — REVERT or wait)`. This is because REVERT brings the slot back, so trying to start a new order on the same plan during the window would create a conflict if the operator changes their mind.

---

## Sim mode vs. production

The cockpit runs in three modes, set in `simulation_config`:

| Mode | What's real | What's stubbed |
|---|---|---|
| `full_mock` | Our DB, the UI, the cron logic | Hypertide API, Smartlead API, Unipile API — all return canned responses |
| `dry_run` | Our DB + real Hypertide API reads | Anything that would write to Hypertide/Smartlead/Unipile is logged but not sent |
| `live` | Everything (currently used only for Smartlead's removal call) | — |

**Sim-only buttons** (no production equivalent — currently all carry a `?` hover tooltip explaining this):
- `TICK SIMULATION`, `POLL ORDERS`, `FINALIZE CANCELLATIONS`, `CHECK WARMUP` — these are cron jobs in production
- `FAST-FORWARD WARMUP (15d)` — production warm-up just runs naturally
- `RESET <CLIENT>` — production has no equivalent; real wind-down is via OFFBOARD CLIENT
- `MARK REQUESTED` — production auto-sends the email; this action stops existing
- `STUB CONNECT` + Success/Fail dropdown — production auto-connects Unipile; this action stops existing

**Real-flow buttons** (exist in production too): `START ONBOARDING`, `APPROVE PAYMENT`, `SET MASTER`, `CONFIRM` (confirm_send_as), `DISCONNECT`, `DEACTIVATE`, `REVERT`, `DISCARD`, `OFFBOARD CLIENT`, `APPROVE REPLACE`, plus tab filters.

---

## State machine reference

A domain order's `status` is the spine of everything:

```
pending_payment
    │  approve_payment
    ▼
paid
    │  hypertide provisions (poll-orders sees done)
    ▼
provisioning ──► done_pre_unipile
    │                │  connect_unipile resolved
    │                ▼
    │            done
    │                │  deactivate (schedules 24h wind-down)
    │                ▼
    │            cancelling ──┬── revert ──► done   (clean undo)
    │                         │
    │                         │  finalize (Smartlead+Unipile+Hypertide)
    │                         ▼
    │                     cancelled
    │
    │  discard (only valid in pending_payment)
    ▼
discarded
```

Anything in `cancelled` or `failed` is **terminal** — that domain goes on the burned list and the slot opens up on the next render.

---

## Driving the simulation — step-by-step tutorial

This walks you through the full lifecycle end-to-end in `full_mock` mode. ~5 minutes to do once. You only need a browser; nothing to install.

### 0. Open the cockpit
Go to https://hubspot-sync-dashboard.vercel.app/hypertide (or `http://localhost:3001/hypertide` if running locally). The MODE indicator under SIMULATION should read `FULL_MOCK · DRY-RUN: ON`. If it doesn't, the rest of this tutorial will hit real APIs — don't proceed.

### 1. Pick a client and start from scratch
- Top-right combobox → choose **Beta Test Studios** (Acme is fine too, but Beta tends to be cleaner).
- Click **RESET BETA TEST STUDIOS** (red button under DEMO TOOLS). Confirm in the modal.
- You should see *"Reset complete: removed N orders, M mailboxes, K pending actions."* and the DOMAIN ORDERS list shows `NO ACTIVE DOMAINS`.

> What just happened: every row tied to this client across orders, mailboxes, pending actions, integrations, metrics, and the job log was wiped. The cockpit is now a blank slate for this client only.

### 2. Onboard a new domain (Trigger 1, step 1)
- In **ONBOARD NEW**, type `try-betateststudios.com` into the Outlook field and `go-betateststudios.com` into the Google field. (The form suggests these — the base client domain is `betateststudios.com` and we prefix with `try-` / `go-`.)
- Click **START OUTLOOK + GOOGLE**. Confirm in the in-app modal.
- DOMAIN ORDERS now shows 2 rows, both `● pending_payment`. PENDING ACTIONS shows 2 `APPROVE PAYMENT` items.

> What just happened: the cockpit called Hypertide's `POST /orders` (mocked), created two domain_order rows, and opened the payment-approval gate for each. Nothing has been "charged" yet because mode is `full_mock`.

### 3. Approve the payments
- Click **APPROVE PAYMENT** on the first action, then on the second.
- Both orders flip to `● paid`. Both actions disappear.

> What just happened: `hypertide-approve-payment` fired Hypertide's `POST /payments/charge` (mocked) for each order.

### 4. Let Hypertide "provision" the domains
- In the SIMULATION panel, click **POLL ORDERS**.
- After a moment, both orders flip to `● done_pre_unipile`. The MAILBOXES column shows `2` per order. PENDING ACTIONS now shows **6 actions** (3 per order): SELECT MASTER, REQUEST SEND AS, CONNECT UNIPILE.

> What just happened: in real life this is a 15-min cron. The button just runs it on demand. We polled Hypertide's `/orders/active`, learned both orders are `done`, pulled the 2-mailbox credentials list per order via `POST /domains/generate-user-credentials-csv`, and opened the post-provision action triplet.

### 5. Configure the master inbox for one of the domains
- Find the SELECT MASTER row for `try-betateststudios.com`.
- The dropdown shows the 2 provisioned addresses. Pick `john.smith@try-betateststudios.com` (or whichever has the `firstname.lastname` shape).
- Click **SET MASTER**. The action resolves; the MASTER INBOX column on the orders row populates.

> What just happened: we picked which mailbox is the "from" face of the domain. In production, this also kicks off an auto-email to Hypertide support requesting the Send-As config. Today (sim), the next action (REQUEST SEND AS) is the operator's reminder that they need to send that email manually.

### 6. Mark the Send-As email as sent
- Click **MARK REQUESTED** on the `request_send_as` action for `try-betateststudios.com`. (The `?` next to it explains this button only exists in the simulation.)
- Action disappears. A new `confirm_send_as` action opens.

### 7. Confirm Send-As (pretending Hypertide replied)
- Click **CONFIRM** on the `confirm_send_as` action.
- Action disappears.

### 8. Connect to Unipile (or simulate a failure)
- Find the CONNECT UNIPILE row for the same domain.
- The Success/Fail dropdown next to it controls how the mocked Unipile call responds. Leave it on **Success** for the happy path.
- Click **STUB CONNECT**. The action resolves. The SNAPSHOT line bumps from "0 connected to Unipile" to "1 connected to Unipile."
- *Want to see the failure path?* Reset, redo through step 8, set the dropdown to **Fail** before clicking. You'll get a `failed` integration row and a RETRY CONNECT button.

### 9. Repeat steps 5–8 for the other domain
You can also do them out of order — the cockpit is permissive about which order you resolve the action triplet in.

### 10. Watch the order flip to `done`
Once all three actions for an order are resolved, its status flips from `done_pre_unipile` to `● done`. The WARMUP column now shows `WARMING · 0/2` because the Smartlead 14-day timer just started for both mailboxes on that order.

### 11. Fast-forward the warmup
- Click **FAST-FORWARD WARMUP (15d)**. Confirmation snack: *"Fast-forwarded warmup on N mailboxes by 15 days."*
- Click **CHECK WARMUP**. The WARMUP column flips to `WARMED · 2/2` for both orders.

> What just happened: we cheated 15 days of clock for every mailbox, then ran the check that rolls per-mailbox warmup completion up to the per-order column. In production the 14-day timer just runs and CHECK WARMUP is on an hourly cron.

### 12. Trigger the replacement loop
- Click **TICK SIMULATION** several times (5-10 clicks). Each click "advances a day" — generates a mock reply-rate per active domain. The rate decays slightly each tick.
- Eventually a domain's 7-day average drops below 1.5%. A **REPLACEMENT NEEDED** nudge auto-opens, or an `APPROVE REPLACE` action shows up in PENDING ACTIONS.
- Click **APPROVE REPLACE** if it's there. Today this doesn't auto-spawn a new order yet — it just acknowledges the recommendation. You'd onboard a fresh domain manually via the ONBOARD NEW form.

### 13. Wind a domain down (Trigger 3, single-order)
- On the `try-betateststudios.com` row in DOMAIN ORDERS, click **DEACTIVATE**. Confirm.
- Status flips to `● cancelling` with a sub-line *"finalizes in 23h 59m"*. The DEACTIVATE button is replaced by **REVERT**.
- The ONBOARD NEW form's Outlook input now reads `(cancelling — REVERT or wait)` and is locked.

### 14. Try REVERT (optional — clean undo)
- Click **REVERT** on the cancelling row.
- Status flips back to `● done`. The form's Outlook input is locked again as `(already active)`.
- This is the "24h grace period" in action — REVERT during the window is a true undo because nothing actually changed yet.

### 15. Force the finalize chain
- DEACTIVATE the order again (so it's `cancelling`).
- Click **FINALIZE CANCELLATIONS** in the SIMULATION panel. (Normally this waits for the 24h timer; the button forces it for any cancelling order regardless of the timer.)
- Watch the chain fire in JOB LOG:
  - `POST /email-accounts/remove` (Smartlead removal — this is the one real API hit by default)
  - `POST /integrations/disconnect` (Unipile, mocked)
  - `POST /subscriptions/cancel` (Hypertide, mocked)
- Status flips `cancelling → cancelled`. The domain joins **BURNED DOMAINS · 1**. The ONBOARD NEW form unlocks the Outlook slot.

### 16. Try the bulk offboard (Trigger 3, fan-out)
- With at least one active order still on Beta, click **OFFBOARD CLIENT** in the header. Confirm.
- Every remaining active order flips to `● cancelling` simultaneously. Click **FINALIZE CANCELLATIONS** to push them all to `cancelled` in one go.

### 17. Reset and start over
- **RESET BETA TEST STUDIOS** wipes the slate for a fresh demo run.

### Cheat sheet — what each sim button is shortcutting

| Button | In production, this is replaced by |
|---|---|
| TICK SIMULATION | nightly 02:00 UTC cron + real Smartlead analytics |
| POLL ORDERS | 15-min cron |
| FINALIZE CANCELLATIONS | hourly cron + the 24h timer being honored |
| CHECK WARMUP | hourly cron |
| FAST-FORWARD WARMUP | nothing — real warmup just runs for 14 days |
| RESET <CLIENT> | nothing — real wind-down only via OFFBOARD CLIENT |
| MARK REQUESTED | auto-email to Hypertide support on SET MASTER |
| STUB CONNECT + Success/Fail dropdown | auto-Unipile-connect post-provisioning |

---

## UI tour — every section of the cockpit screen

Walking down the page top-to-bottom:

### Header — client switcher + OFFBOARD CLIENT
The combobox in the top right switches the active client. Every section below filters to whatever's selected. **OFFBOARD CLIENT** (red button next to the switcher) is the bulk wind-down: marks the client offboarded + DEACTIVATEs every active order. See Trigger 3 below.

### SIMULATION panel
Shows the active simulation mode (`full_mock` / `dry_run` / `live`), the `force_dry_run` flag, and four buttons that exist only because crons are disabled: **TICK SIMULATION**, **POLL ORDERS**, **FINALIZE CANCELLATIONS**, **CHECK WARMUP**. Each has a `?` hover badge with full detail. In production these run on crons (see [Cron jobs](#cron-jobs)).

The panel also shows the client's billing line — `forwarding domain · monthly limit · auto-replace`.

### DEMO TOOLS
Only renders in `full_mock` mode. Two buttons — **FAST-FORWARD WARMUP (15d)** and **RESET <CLIENT>**. Both are sim-only escape hatches with no production analog. RESET wipes every order, mailbox, pending action, integration, metric, and log entry for the active client; FAST-FORWARD backdates warm-up timers by 15 days so the next CHECK WARMUP marks them complete.

### ONBOARD NEW
The form that drives Trigger 1. Two inputs (Outlook + Google domain), a base-domain hint (`acmedemo.com → try-acmedemo.com / go-acmedemo.com`), an availability link to Hypertide's dashboard, and inline validation tags:
- 🟥 `DOMAIN ALREADY IN USE` — collision with an existing active order (DB-enforced)
- 🟪 `BURNED PREVIOUSLY` — same client has retired this domain before; you can override
- 🟨 `NON-.COM · MAY HURT DELIVERABILITY` — non-`.com` TLD warning, not a block
- `(already active)` / `(cancelling — REVERT or wait)` — plan slot is occupied; the input locks

Submit opens an in-app confirmation modal before firing.

### BURNED DOMAINS · *n*
The retired-domains memory list for the active client. Drives the burned-warning tag on the form. A domain lands here the moment one of its orders flips to `cancelled` or `failed`.

### DOMAIN ORDERS · *n*
The truth table for everything in flight or done. Columns:
- **PLAN** (Outlook / Google)
- **DOMAIN**
- **STATUS** — the order's lifecycle state; `● cancelling` shows a "finalizes in 23h 37m" sub-line
- **MASTER INBOX** — the chosen address, or `—` if not yet picked
- **MAILBOXES** — count of provisioned mailboxes
- **WARMUP** — rollup like `WARMING · 3/4` or `WARMED` (all mailboxes complete)
- **ACTIONS** — DEACTIVATE / REVERT / DISCARD depending on status

The `SNAPSHOT` line under the heading gives a one-glance summary: `ACTIVE: 1 Outlook · 1 Google · 4 mailboxes · 2 connected to Unipile`. Three tabs filter the table: **ACTIVE** (in-flight + done), **HISTORY** (terminal), **ALL**.

### PENDING ACTIONS · *n*
The "what do I need to do next" list. Each row is one row in `pending_actions` with the inline button(s) to resolve it. Action types: SELECT MASTER (with a "pick firstname.lastname" hint for Google admin convention), REQUEST SEND AS / MARK REQUESTED, CONFIRM SEND AS, CONNECT UNIPILE / STUB CONNECT (+ Success/Fail dropdown in sim), DISCONNECT, APPROVE PAYMENT, APPROVE REPLACE, REMOVE FROM SMARTLEAD (retry), ONBOARD REPLACEMENT (the REPLACEMENT NEEDED nudge).

### JOB LOG · LATEST 15
The 15 most recent rows from `job_log`. Each row: API verb + path, scope (`domain_order` / `pending_action` / `client`), mode tag (`DRY` / `MOCK` / `LIVE`), timestamp. Garbage-collected by SQL helper `reset_garbage_collect_job_log` to keep growth bounded.

---

## Database schema (`hypertide_app`)

Eleven tables, all isolated from the HubSpot `public` schema. RLS is on everywhere; anon + authenticated have read; service_role has full access.

| Table | What's in it |
|---|---|
| `clients` | The companies we onboard outreach domains for. Demo seed: Acme Demo Co, Beta Test Studios. |
| `billing_config` | Per-client config — `forwarding_domain`, `monthly_limit_usd`, `auto_replace` flag. |
| `domain_orders` | One row per purchased domain. Fields include status, plan, payment timestamps, `cancellation_scheduled_at` (24h wind-down), `smartlead_removal_*` (per-order Smartlead removal tracking), `done_at`. Partial unique index enforces "one active order per domain across all clients." |
| `mailboxes` | One row per provisioned mailbox. Holds creds, master flag, `bcc_forwarding_configured_at`, `smartlead_warmup_started_at`, `smartlead_warmup_completed_at`. |
| `pending_actions` | Open work for operators. Scoped to client or domain_order. Status: `pending` / `resolved`. |
| `integration_connections` | Tracks the link between a mailbox and an external integration (Unipile, Smartlead). `status='connected'`/`'failed'`/`'disconnected'`. |
| `metrics_snapshots` | Daily per-domain mock reply-rate metrics. Generated by `generate_mock_metrics` SQL helper on every tick. |
| `replacement_jobs` | One row per "this domain should be replaced." Status: `proposed` / `approved` / `executed`. |
| `job_log` | Append-only audit feed of every API call we make. Drives the JOB LOG panel. |
| `simulation_config` | Singleton row (`id=1`) holding `mode` and `force_dry_run`. |
| `mock_responses` | Canned responses keyed by endpoint, used when mode = `full_mock`. Seeded for 9 Hypertide + Smartlead endpoints. |

Enums: `plan_type` (entra / google), `order_status` (the spine), `pending_action_type`, `pending_action_status`, `integration_provider`, `metrics_source`.

SQL helpers (functions in the schema):
- `get_secret(name)` — reads Vault
- `generate_mock_metrics(...)` — fakes a daily reply-rate per active domain on TICK
- `propose_replacements(...)` — runs the 7-day-avg < 1.5% check, opens `replacement_jobs`
- `mailbox_warmup_status(mailbox_id)` — `'pending' | 'warming' | 'warmed'` per mailbox
- `order_warmup_summary(order_id)` — rollup like `{ completed: 3, total: 4 }` per order
- `trigger_edge_function(name, payload)` — used by crons to invoke our Edge Functions from inside Postgres via `pg_net`
- `reset_garbage_collect_job_log(...)` — bounded retention for the job log

---

## Edge Functions reference

All deployed in Supabase project `ttqiesrxpmcduigjiovm`, prefix `hypertide-`. Each one is callable from the cockpit via [lib/hypertide.ts](lib/hypertide.ts).

| Function | Called by | What it does |
|---|---|---|
| `hypertide-create-onboarding` | ONBOARD NEW form | Validates input, inserts `domain_orders` row(s), calls Hypertide `POST /orders`, opens `APPROVE PAYMENT` pending action. |
| `hypertide-approve-payment` | APPROVE PAYMENT pending action | Calls Hypertide `POST /payments/charge`, flips order → `paid`. |
| `hypertide-poll-orders` | POLL ORDERS button / 15-min cron | Reads Hypertide `/orders/active`, transitions paid → done, pulls mailbox creds, opens the 3 post-provision pending actions. |
| `hypertide-resolve-action` | Every "resolve" button on a pending action | Generic resolver. Reads `pending_actions.action_type`, runs the type-specific side-effects (set master, mark requested, confirm send-as, connect Unipile, etc.), marks the action resolved. |
| `hypertide-cancel-subscription` | DEACTIVATE / REVERT buttons | `verify` checks preconditions, `cancel` schedules the 24h wind-down, `revert` undoes a scheduled cancellation cleanly. |
| `hypertide-finalize-cancellations` | FINALIZE CANCELLATIONS button / hourly cron | Finds every order in `cancelling` past its 24h window (or all of them when `force=true`), runs Smartlead removal + Unipile disconnect + Hypertide subscription cancel + status flip. |
| `hypertide-smartlead-remove` | Called inline by `finalize-cancellations`; also exposed for retry on the `remove_from_smartlead` pending action | Calls Smartlead's real API (or the mocked endpoint in `full_mock` mode) to remove every mailbox of the given orders. **This is the one piece of the cockpit that already runs against a real third-party API.** |
| `hypertide-tick` | TICK SIMULATION / nightly cron | Generates mock daily metrics, calls `propose_replacements`, auto-approves replacements that fit within `monthly_limit_usd` or opens an `APPROVE REPLACE` action otherwise. |
| `hypertide-offboard-client` | OFFBOARD CLIENT button | Fan-out wrapper: marks client offboarded + calls `cancel-subscription` for every active order. |
| `hypertide-discard-order` | DISCARD button | Drops a `pending_payment` order. Will refuse anything past pending_payment. |
| `hypertide-check-warmup` | CHECK WARMUP / hourly cron | Sweeps mailboxes, marks `smartlead_warmup_completed_at` where elapsed > 14d, rolls up to the WARMUP column. |
| `hypertide-fastforward-warmup` | FAST-FORWARD WARMUP button | Sim-only — backdates `smartlead_warmup_started_at` by N days for the active client. |
| `hypertide-reset-client` | RESET <CLIENT> button | Sim-only — deletes every row tied to the client across orders / mailboxes / pending_actions / integrations / metrics / job_log. Hard-gated to `full_mock` mode. |

---

## Cron jobs

Four were written, tested end-to-end, and **then unscheduled** per user preference. To turn the system production-ready, re-enable these:

| Job | Cadence | Function it triggers |
|---|---|---|
| Provisioning poller | every 15 min | `hypertide-poll-orders` |
| Replacement ticker | nightly @ 02:00 UTC | `hypertide-tick` |
| Finalize cancellations | hourly | `hypertide-finalize-cancellations` |
| Warm-up checker | hourly | `hypertide-check-warmup` |

All four use `pg_cron` + `pg_net` and the `trigger_edge_function` SQL helper to call the Edge Function over HTTPS from inside Postgres.

---

## Mocking system

When `simulation_config.mode = 'full_mock'`, every outbound HTTP call to Hypertide / Smartlead / Unipile is intercepted and answered from the `mock_responses` table. Mock rows are keyed by `endpoint` + an optional `simulate_result` (used by Unipile and Smartlead-remove to let the operator exercise both success and failure paths via the dropdown). Seeded for 9 endpoints including the Smartlead remove success/fail pair.

In `dry_run` mode reads hit the real APIs but writes are intercepted and logged with mode tag `DRY` in `job_log`. In `live` mode (currently only used for Smartlead removal during finalize) everything goes through.

---

## Secrets

Stored in Supabase Vault, read via the `get_secret` SQL function (which Edge Functions call):

| Secret | Used by |
|---|---|
| `hypertide_api_key` | Every Edge Function that hits Hypertide |
| `hypertide_base_url` | Same — lets us swap sandbox / prod by changing one row |
| `smartlead_api_key` | `hypertide-smartlead-remove`, future warm-up checker |
| `supabase_service_role_key` | Cron functions that need to reach the Edge Function HTTP endpoints (since `pg_net` needs an auth header) |

---

## Deployment & stack

- **Frontend:** Next.js 14.2 App Router, Tailwind, deployed on Vercel as part of the `hubspot-sync-dashboard` project. Auto-deploys on push to `main`.
- **Backend:** Supabase project `ttqiesrxpmcduigjiovm` — Postgres (schema `hypertide_app`), Edge Functions, Vault, pg_cron, pg_net.
- **Live URL:** https://hubspot-sync-dashboard.vercel.app/hypertide
- **Repo:** https://github.com/panduartanaputra/hubspot-sync-dashboard
- **CI:** none beyond Vercel's build. No test suite yet.

### Local dev
```bash
cd hubspot-sync-dashboard
# .env.local must include NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npx next dev -p 3001
# then open http://localhost:3001/hypertide
```

There's also a `.claude/launch.json` entry that lets the Claude Code preview server boot it automatically.

---

## What lives where

| Layer | Path |
|---|---|
| Page (state + composition) | [app/hypertide/page.tsx](app/hypertide/page.tsx) |
| Onboard form | [components/hypertide/OnboardForm.tsx](components/hypertide/OnboardForm.tsx) |
| Orders table | [components/hypertide/DomainOrdersTable.tsx](components/hypertide/DomainOrdersTable.tsx) |
| Pending actions list | [components/hypertide/PendingActionsList.tsx](components/hypertide/PendingActionsList.tsx) |
| Sim controls | [components/hypertide/SimControls.tsx](components/hypertide/SimControls.tsx) |
| Burned domains | [components/hypertide/BurnedDomainsTable.tsx](components/hypertide/BurnedDomainsTable.tsx) |
| Tooltip `?` icon (shared) | [components/hypertide/HelpIcon.tsx](components/hypertide/HelpIcon.tsx) |
| Side nav + app shell | [components/SidePanel.tsx](components/SidePanel.tsx), [components/AppShell.tsx](components/AppShell.tsx) |
| API client (fetches + Edge Function invokers + types) | [lib/hypertide.ts](lib/hypertide.ts) |
| Edge Functions | Supabase project `ttqiesrxpmcduigjiovm`, prefix `hypertide-*` |
| DB schema | Supabase schema `hypertide_app` (not `public`) |
| Migrations | 16 applied to `hypertide_app` |

---

## Glossary

| Term | Meaning |
|---|---|
| **Outreach domain** | A domain we rent from Hypertide specifically to send cold emails from. Distinct from the client's real brand domain. |
| **Forwarding domain** | The client's real brand domain (e.g. `acmedemo.com`). Used as the suggested base when typing new outreach domains. Not bought by us. |
| **Master inbox** | The mailbox on a domain that's the "from" address on the wire (via Send-As) and the one connected to Unipile for replies. |
| **Send-As** | Hypertide's relay config that lets Smartlead send through a rented mailbox while showing a chosen "from" address. Requires an email to Hypertide support to set up per domain. |
| **Warm-up** | Smartlead's 14-day per-mailbox process of slowly ramping send volume so the mailbox builds a deliverability reputation. |
| **Burned** | A domain previously retired (cancelled/failed) for a given client. Tracked per-client; gives a warning on re-buy but isn't a hard block. |
| **Replacement** | The auto-triggered flow when a domain's reply-rate decays below 1.5% on 7-day average. Spawns a `replacement_jobs` row. |
| **24h wind-down** | The grace period between DEACTIVATE and finalize. REVERT during this window is a clean undo. |
| **Pending action** | A unit of human work in `pending_actions` — what the operator needs to do next. Distinct from `order_status` which is what state the system is in. |
| **purchase_domain_for_me** | The only Hypertide purchase mode we use — Hypertide picks/registers the domain on our behalf (we don't go to a registrar ourselves). |
| **Snapshot** | One-line summary of active orders shown at the top of the DOMAIN ORDERS section. |
| **`entra` (internal) vs Outlook (UI)** | Same thing; `entra` matches Hypertide's API wire format, UI uses operator-friendly "Outlook." |

---

## FAQ — questions you'll probably also ask

### What makes a domain "burned" — and what does it cost us?
A domain is burned the moment one of its orders transitions to `cancelled` or `failed`. The domain joins that client's BURNED DOMAINS list and the onboarding form throws a purple warning if anyone tries to re-buy it for the same client. Re-buying a burned domain is allowed (operator can click PROCEED ANYWAY in the warning modal) but discouraged because the reputation history travels with the domain — spam blacklists, IP reputation hangover, etc. There's no global ban, just a per-client memory.

### Why does one domain have several mailboxes — why not just one?
Outreach volume. Each mailbox can only safely send a small number of cold emails per day (typically 20–40) before deliverability suffers. By spreading sends across, say, 4 mailboxes on the same domain, we get 4x the throughput without ruining any single mailbox's reputation. Smartlead rotates between them inside a single campaign.

### What's special about the master inbox?
It's the **visible "from" address** to recipients (because of Send-As) and it's the **mailbox we connect to Unipile** so all replies route to one place. The other mailboxes on the domain are sender pool only — replies to them get pulled into the master via aliasing / forwarding rules set up during Send-As configuration. That's why SELECT MASTER is the first pending action after provisioning: nothing else can be set up until the master is chosen.

### What is "Send-As" actually doing?
Send-As is Hypertide's relay configuration that lets a Smartlead campaign *send through* one of our rented mailboxes but show a chosen "from" address on the wire. Without it, our outbound would either look like it came from Smartlead's infra (bad for deliverability) or from a raw provisioned mailbox name. Setting it up requires an email to Hypertide support with the master inbox details — that's what the `request_send_as` / MARK REQUESTED step exists for today.

### If Smartlead does the sending, why do we also need Unipile?
Different jobs. **Smartlead** is the outbound engine — warm-up + campaign orchestration + sending. **Unipile** is the inbound aggregator — it watches every connected master inbox across every domain across every client and surfaces replies in a unified view elsewhere in the platform. You could run Smartlead without Unipile, but then operators would have to log into N mailboxes to read replies.

### Why `.com` only — what's wrong with `.net` / `.org` / `.info` / `.biz`?
Pure deliverability. `.com` has the strongest reputation by default with major inbox providers; less-common TLDs (especially `.info` / `.biz`) trip more spam filters even with a clean history. Hypertide *will* register non-`.com` domains for us, but the form shows a gold warning and we'd only pick one if `.com` truly wasn't available.

### What's the difference between DEACTIVATE and OFFBOARD CLIENT?
DEACTIVATE is single-domain: wind down this one order. OFFBOARD CLIENT is bulk: wind down *every* active order this client has, in one call, and mark the client as offboarded. Both share the same 24h `cancelling` window and the same finalize chain — OFFBOARD CLIENT is just a fan-out.

### When is DISCARD the right button?
Only for orders stuck in `pending_payment` — i.e., the order was created but nobody approved payment, so nothing has been bought yet, no mailboxes exist, no money has changed hands. DISCARD just drops the row. Once an order is `paid` or beyond, DISCARD disappears and the only exit is DEACTIVATE → finalize.

### What does the "auto-replace" toggle on a client do?
When `auto-replace` is ON, an approved replacement_job will (eventually — see Open threads) automatically spawn a new ONBOARD on the same plan as the decayed domain. When OFF, the replacement still gets approved but the operator has to manually open ONBOARD NEW and type a fresh domain. Today auto-execute isn't wired in either mode, so the toggle is informational; the flag affects the language of the REPLACEMENT NEEDED nudge.

### What's the difference between `full_mock`, `dry_run`, and `live`?
- **`full_mock`** — everything outside our DB is canned. No real API calls to Hypertide / Smartlead / Unipile. Safe for demos.
- **`dry_run`** — real *read* calls to Hypertide (e.g. POLL ORDERS hits the real `/orders/active`), but any *write* (charge, cancel, etc.) is logged and skipped. Useful for sanity-checking against real Hypertide state without side effects.
- **`live`** — writes go through. Today only the Smartlead removal call runs live; the rest of the lifecycle is still gated by mock state until we've cleared the open threads.

### Why is the internal enum `entra` but the UI says "Outlook"?
Hypertide's API uses `entra` (because Microsoft's Outlook plans are Entra ID-backed). We kept their wire format internally so we don't have to translate at every boundary, but operators don't speak in those terms — to them it's just "Outlook." So every user-facing label says **Outlook**; every DB row and API payload says `entra`.

### What's the "forwarding domain" shown next to each client?
It's the client's *real* root domain (e.g. `acmedemo.com`) — the brand identity. Every outreach domain we buy for them is a **variant** of that root (`try-acmedemo.com`, `go-acmedemo.com`, `mail-acmedemo.com`). The forwarding domain isn't bought by us; it already belongs to the client and is set in `billing_config.forwarding_domain`. We just use it as the suggested base when the operator types new outreach domains.

### What happens to the actual mailboxes when an order is cancelled?
At finalize time:
- They're **removed from Smartlead** (so they stop sending and stop being part of any campaign).
- The master inbox is **disconnected from Unipile** (replies stop routing).
- The mailbox rows stay in our DB for history (we never hard-delete provisioned mailboxes — useful for audit), but their `order` parent is now `cancelled` and they no longer appear in the active snapshot.
- The domain itself returns to Hypertide via their `POST /subscriptions/cancel` so they stop billing us.

### How are billing limits enforced?
Each client has a `monthly_limit_usd` in `billing_config` (e.g. Acme's is $500). When the replacement loop proposes a new domain order, it checks whether the *projected* monthly spend (existing active orders' subscription costs + the cost of the new one) is under the limit. Below limit → replacement is auto-approved. Above limit → a `replace_approve` pending action is opened so the operator can override. Limits are advisory only on the onboarding form (no block) but enforcing on replacement keeps auto-replacement from spiraling.

### What's the difference between APPROVE PAYMENT and APPROVE REPLACE?
APPROVE PAYMENT lives on a single order — it's the operator saying "yes, charge Hypertide for this purchase." It's part of every onboarding. APPROVE REPLACE lives on a replacement_job — it's the operator saying "yes, the system is right that this decayed domain should be replaced." APPROVE REPLACE only appears when the replacement was over the billing limit; otherwise the system auto-approves it silently.

### Can two different clients ever own the same domain?
No. A partial unique index on `domain_orders` enforces that any domain in a non-terminal state (`pending_payment` through `cancelling`) can only exist once across the whole DB. The onboarding form also pre-flights this via the `ALREADY USED BY AN ACTIVE ORDER` red warning. Terminal states (`cancelled`, `failed`, `discarded`) don't lock the slot — but if the *same client* burned it, the burned warning still fires.

### What's a "pending action" exactly, and how does it relate to order status?
A pending action is a unit of human work the system can't do on its own. They're rows in `pending_actions` scoped to either a domain order or a client. The orders table shows *what state we're in*; the pending actions list shows *what the operator needs to do next*. An order can be `done_pre_unipile` and simultaneously have three pending actions open (select_master, request_send_as, connect_unipile) — once all three resolve, the order flips to `done`. Status and actions move together.

### Why does the cockpit live at `/hypertide` and not the root?
The root path (`/`) of this app is the **HubSpot Sync Cockpit** — separate piece of work for a different part of the platform. The Hypertide cockpit was bolted onto the same Next.js app to share infra (Supabase project, auth, deploy pipeline) but its DB schema (`hypertide_app`) is fully isolated from the HubSpot tables so neither side can pollute the other.

---

## Open threads (what's not done yet)

1. **Smartlead probe.** Verify whether `DELETE /email-accounts/{id}` actually exists on Smartlead's API, and inspect the `warmup_details` field shape. If DELETE doesn't exist, pivot the removal flow to "disable warmup + remove from campaigns."
2. **Real Unipile API.** No subscription yet — all Unipile calls are stubbed.
3. **Replacement execute step.** APPROVE REPLACE opens the nudge but doesn't auto-spawn a new domain order; operator must onboard manually.
4. **Auto-email Hypertide support after SET MASTER.** Today operator emails manually then clicks MARK REQUESTED.
5. **Crons enabled.** poll/tick/finalize/check-warmup crons are written and tested but disabled until we're ready for production.

---

## TL;DR for a stand-up

> The cockpit is a Next.js page wired to ~13 Supabase Edge Functions. It models the lifecycle of rented outreach domains in three triggers: onboard → replace → offboard. Hypertide does the buying and the Send-As relay. Smartlead does the warm-up and the actual cold-email sending. Unipile aggregates replies. Everything is sim'd today; real Smartlead removal is wired but not fully verified; Unipile/replacement-execute/auto-email are still stubs.
