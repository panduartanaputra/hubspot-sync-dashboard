// Phase 3 — HubSpot scope catalog + dynamic consent model.
//
// One HubSpot app (42333854), one client_id/secret. "Dynamic scopes" just means
// we assemble the `scope=` (locked) + `optional_scope=` (user-selected) params
// per connection from the user's consent-screen choices. No per-user app.
//
// PORT NOTE (METIS): this module is pure config + helpers, no cockpit-specific
// deps — it ports as-is. Only the OPTIONAL scopes below must be registered as
// "optional" on the HubSpot app in the developer portal, or HubSpot silently
// drops them (we detect drops via granted_scopes after connect).

// ── Locked scopes ──────────────────────────────────────────────────────────
// Always requested. The app's core outbound (push contacts/deals/meetings +
// namespaced custom-property provisioning) depends on these. Meeting
// engagements are covered by crm.objects.contacts.write (confirmed: there is no
// separate crm.objects.meetings.* scope).
export const LOCKED_SCOPES: string[] = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.schemas.contacts.write",
  "crm.schemas.deals.write",
];

// ── Optional scopes, keyed by selectable capability ──────────────────────────
// MUST also be registered as optional scopes on HubSpot app 42333854.
// push.notes = agent enrichment written as Metis-branded custom TIMELINE EVENTS,
// which needs the `timeline` scope. Capabilities not listed here (push meetings,
// pull contacts/deals) need NO extra scope — they're covered by locked scopes and
// are governed purely by the sync_config flags. (Tasks push is not built yet.)
export const OPTIONAL_SCOPES: Record<string, string[]> = {
  "push.companies": ["crm.objects.companies.write", "crm.schemas.companies.write"],
  "push.notes": ["timeline"],
  "pull.companies": ["crm.objects.companies.read"],
  "pull.owners": ["crm.objects.owners.read"],
  "pull.line_items": ["crm.objects.line_items.read"],
};

// The exact optional-scope list to register in the HubSpot developer portal.
export const OPTIONAL_SCOPES_TO_REGISTER: string[] = Array.from(
  new Set(Object.values(OPTIONAL_SCOPES).flat()),
);

// ── Consent selection shape ──────────────────────────────────────────────────
export interface SyncConfig {
  push: {
    contacts: boolean;   // locked on
    deals: boolean;      // locked on
    meetings: boolean;   // locked on
    companies: boolean;
    notes: boolean;
    tasks: boolean;
  };
  pull: {
    contacts: boolean;
    companies: boolean;
    deals: boolean;
    owners: boolean;
    line_items: boolean;
  };
}

// Defaults: the three core push objects are locked on; everything optional is
// off until the user opts in (pull is entirely opt-in — the "hub" is additive).
export function defaultSyncConfig(): SyncConfig {
  return {
    push: { contacts: true, deals: true, meetings: true, companies: false, notes: false, tasks: false },
    pull: { contacts: false, companies: false, deals: false, owners: false, line_items: false },
  };
}

// Coerce untrusted input (query param / stored jsonb) into a valid SyncConfig,
// forcing the locked-on push flags true regardless of what was passed.
export function normalizeSyncConfig(input: unknown): SyncConfig {
  const base = defaultSyncConfig();
  const obj = (input ?? {}) as Partial<SyncConfig>;
  const push = (obj.push ?? {}) as Partial<SyncConfig["push"]>;
  const pull = (obj.pull ?? {}) as Partial<SyncConfig["pull"]>;
  return {
    push: {
      contacts: true, deals: true, meetings: true, // locked
      companies: !!push.companies,
      notes: !!push.notes,
      tasks: !!push.tasks,
    },
    pull: {
      contacts: !!pull.contacts,
      companies: !!pull.companies,
      deals: !!pull.deals,
      owners: !!pull.owners,
      line_items: !!pull.line_items,
    },
  };
}

// Map a normalized SyncConfig to the capability keys that require optional scopes.
function selectedOptionalCapabilities(cfg: SyncConfig): string[] {
  const caps: string[] = [];
  if (cfg.push.companies) caps.push("push.companies");
  if (cfg.push.notes) caps.push("push.notes");
  if (cfg.pull.companies) caps.push("pull.companies");
  if (cfg.pull.owners) caps.push("pull.owners");
  if (cfg.pull.line_items) caps.push("pull.line_items");
  return caps;
}

// Build the `scope` (locked) + `optional_scope` (selected) strings for the
// HubSpot authorize URL. Deduped; optional excludes anything already locked.
export function buildAuthScopeParams(cfg: SyncConfig): { scope: string; optionalScope: string } {
  const optional = new Set<string>();
  for (const cap of selectedOptionalCapabilities(cfg)) {
    for (const s of OPTIONAL_SCOPES[cap] ?? []) {
      if (!LOCKED_SCOPES.includes(s)) optional.add(s);
    }
  }
  return {
    scope: LOCKED_SCOPES.join(" "),
    optionalScope: Array.from(optional).join(" "),
  };
}

// After connect, compare what we asked for vs what HubSpot actually granted
// (granted_scopes from token introspection). Returns optional scopes that were
// silently dropped — surfaced to the user so a missing feature isn't a mystery.
export function droppedOptionalScopes(cfg: SyncConfig, granted: string[]): string[] {
  const grantedSet = new Set(granted);
  const requested = new Set<string>();
  for (const cap of selectedOptionalCapabilities(cfg)) {
    for (const s of OPTIONAL_SCOPES[cap] ?? []) requested.add(s);
  }
  return Array.from(requested).filter((s) => !grantedSet.has(s));
}
