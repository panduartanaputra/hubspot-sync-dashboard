"use client";

import { supabase } from "./supabase";

// ============ TYPES (mirror hypertide_app schema) ============

export type PlanType = "entra" | "google";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "provisioning"
  | "done_pre_unipile"
  | "done"
  | "replacing"
  | "cancelling"
  | "cancelled"
  | "failed";

export type PendingActionType =
  | "approve_payment"
  | "select_master"
  | "request_send_as"
  | "confirm_send_as"
  | "connect_unipile"
  | "disconnect_unipile"
  | "replace_approve"
  | "remove_from_smartlead"
  | "onboard_replacement"
  | "waiting_for_hypertide_sheet";

export type PendingActionStatus = "pending" | "in_progress" | "done" | "skipped";

export interface Client {
  id: string;
  name: string;
  forwarding_domain: string;
  contact_email: string | null;
  status: string; // 'active' | 'offboarded'
  offboarded_at: string | null;
  created_at: string;
}

export interface BillingConfig {
  client_id: string;
  monthly_limit_usd: number;
  auto_replace_enabled: boolean;
  current_month_spend: number;
  period_start: string;
}

export interface DomainOrder {
  id: string;
  client_id: string;
  plan: PlanType;
  domain: string;
  master_inbox: string | null;
  status: OrderStatus;
  inbox_quantity: number | null;
  hypertide_record_id: string | null;
  hypertide_subscription_id: string | null;
  hypertide_product_id: string | null;
  paid_at: string | null;
  done_at: string | null;
  last_polled_at: string | null;
  failure_reason: string | null;
  /** When DEACTIVATE / OFFBOARD CLIENT was clicked. After +24h the finalize
   *  function removes from Smartlead, disconnects Unipile, and flips the
   *  order to `cancelled`. REVERT clears this column and restores the order. */
  cancellation_scheduled_at: string | null;
  smartlead_removed_at: string | null;
  smartlead_removal_status: "pending" | "success" | "failed" | null;
  smartlead_removal_failure_reason: string | null;
  created_at: string;
}

export interface Mailbox {
  id: string;
  domain_order_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_master: boolean;
  send_as_granted_at: string | null;
  bcc_forwarding_configured_at: string | null;
  /** Smartlead's 14-day warm-up clock starts here, set when the mailbox is
   *  provisioned. After +14 days the warmup-checker function marks completed_at. */
  smartlead_warmup_started_at: string | null;
  smartlead_warmup_completed_at: string | null;
}

export interface PendingAction {
  id: string;
  domain_order_id: string | null;
  client_id: string | null;
  action_type: PendingActionType;
  status: PendingActionStatus;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface SimulationConfig {
  id: number;
  mode: "full_mock" | "hypertide_live_unipile_off" | "live";
  force_dry_run: boolean;
  mock_clock: string;
}

export interface ReplacementJob {
  id: string;
  old_domain_order_id: string;
  new_domain_order_id: string | null;
  reason: string | null;
  state: string;
  triggered_at: string;
  approved_at: string | null;
  completed_at: string | null;
  auto_approved: boolean;
}

export interface JobLogRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  hypertide_request_id: string | null;
  payload: unknown;
  response: unknown;
  success: boolean;
  dry_run: boolean;
  created_at: string;
}

// ============ HELPERS ============

const ht = () => supabase.schema("hypertide_app");

// ============ QUERIES ============

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await ht().from("clients").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function fetchBilling(clientId: string): Promise<BillingConfig | null> {
  const { data, error } = await ht().from("billing_config").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as BillingConfig | null;
}

export async function fetchDomainOrders(clientId: string): Promise<DomainOrder[]> {
  const { data, error } = await ht().from("domain_orders").select("*").eq("client_id", clientId).order("created_at");
  if (error) throw error;
  return (data ?? []) as DomainOrder[];
}

export async function fetchBurnedDomains(clientId: string): Promise<DomainOrder[]> {
  // Only count domains that were actually paid for (reputation risk).
  // Orders cancelled before payment never went live — exclude them.
  const { data, error } = await ht()
    .from("domain_orders")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["cancelled", "failed"])
    .not("paid_at", "is", null)
    .order("done_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DomainOrder[];
}

export async function fetchMailboxes(orderIds: string[]): Promise<Mailbox[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await ht().from("mailboxes").select("*").in("domain_order_id", orderIds);
  if (error) throw error;
  return (data ?? []) as Mailbox[];
}

export interface IntegrationConnection {
  id: string;
  mailbox_id: string;
  provider: "unipile" | "manual" | "smartlead" | "instantly";
  external_account_id: string | null;
  status: "not_connected" | "connected" | "failed";
  connected_at: string | null;
  last_error: string | null;
}

export async function fetchIntegrations(mailboxIds: string[]): Promise<IntegrationConnection[]> {
  if (mailboxIds.length === 0) return [];
  const { data, error } = await ht().from("integration_connections").select("*").in("mailbox_id", mailboxIds);
  if (error) throw error;
  return (data ?? []) as IntegrationConnection[];
}

export async function fetchPendingActions(clientId: string): Promise<PendingAction[]> {
  const { data, error } = await ht()
    .from("pending_actions")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PendingAction[];
}

export async function fetchSimConfig(): Promise<SimulationConfig | null> {
  const { data, error } = await ht().from("simulation_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return (data ?? null) as SimulationConfig | null;
}

export async function fetchJobLog(limit = 30): Promise<JobLogRow[]> {
  const { data, error } = await ht()
    .from("job_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as JobLogRow[];
}

// ============ EDGE FUNCTION CALLERS ============

async function invoke<T = unknown>(name: string, body: unknown = {}): Promise<T> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw new Error(`${name} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export const fn = {
  createOnboarding: (args: { client_id: string; entra_domain: string; google_domain: string }) =>
    invoke("hypertide-create-onboarding", args),
  approvePayment: (args: { domain_order_ids: string[] }) =>
    invoke("hypertide-approve-payment", args),
  pollOrders: () => invoke("hypertide-poll-orders", {}),
  cancelSubscription: (args: { action: "verify" | "cancel" | "revert"; domain_order_ids: string[] }) =>
    invoke("hypertide-cancel-subscription", args),
  tick: () => invoke<{ metrics_inserted: number; replacements_proposed: number }>("hypertide-tick", {}),
  resolveAction: (args: { pending_action_id: string; payload?: Record<string, unknown> }) =>
    invoke<{
      success: boolean;
      action?: string;
      mode?: "live" | "full_mock";
      unipile_link_url?: string;
      account_link_pending?: boolean;
      code?: string;
      message?: string;
    }>("hypertide-resolve-action", args),
  discardOrder: (args: { domain_order_id: string }) => invoke("hypertide-discard-order", args),
  offboardClient: (args: { client_id: string }) =>
    invoke<{ success: boolean; client: string; summary: { discarded: number; scheduled: number; skipped_actions: number } }>(
      "hypertide-offboard-client",
      args
    ),
  finalizeCancellations: (args?: { force?: boolean; simulate_smartlead?: "success" | "fail" }) =>
    invoke<{ success: boolean; finalized: number; summary: Array<Record<string, unknown>> }>(
      "hypertide-finalize-cancellations",
      args ?? {}
    ),
  smartleadRemove: (args: { domain_order_ids: string[]; simulate_result?: "success" | "fail" }) =>
    invoke<{ success: boolean; results: Array<Record<string, unknown>> }>(
      "hypertide-smartlead-remove",
      args
    ),
  resetClient: (args: { client_id: string }) =>
    invoke<{ success: boolean; client: string; removed: { orders: number; mailboxes: number; pending_actions: number } }>(
      "hypertide-reset-client",
      args
    ),
  checkWarmup: () =>
    invoke<{ success: boolean; mailboxes_just_completed: number; orders: Array<{ domain: string; plan: string; total: number; completed: number; warming: number }> }>(
      "hypertide-check-warmup",
      {}
    ),
  fastForwardWarmup: (args: { client_id?: string; days?: number }) =>
    invoke<{ success: boolean; updated: number }>(
      "hypertide-fastforward-warmup",
      args
    ),
  sendHypertideEmail: (args: { client_id: string; dry_run?: boolean }) =>
    invoke<{ success?: boolean; skipped?: boolean; reason?: string; message_id?: string; thread_id?: string; domains?: string[]; dry_run?: boolean; subject?: string; body?: string; error?: string; detail?: unknown }>(
      "hypertide-send-hypertide-email",
      args
    ),
  unipileSend: (args: { domain_order_id: string; to: string; from?: string; display_name?: string; subject?: string; body?: string }) =>
    invoke<{ success: boolean; domain?: string; master_inbox?: string; from_inbox?: string; display_name?: string; tracking_id?: string; provider_id?: string; status?: number; detail?: unknown; error?: string }>(
      "hypertide-unipile-send",
      args
    ),
  syncMasterFromSheet: (args?: { client_id?: string }) =>
    invoke<{ success: boolean; synced_clients: number; summary: Array<{ client_id: string; matched: Array<{ domain: string; plan: string; master_inbox: string }>; unmatched: Array<{ domain: string; plan: string; reason?: string; sheet_master?: string; db_mailboxes?: string[] }>; waiting_resolved: boolean }> }>(
      "hypertide-sync-master-from-sheet",
      args ?? {}
    ),
};

/** Per-order warm-up state derived from its mailboxes. */
export interface WarmupRollup {
  total: number;
  completed: number;
  warming: number;
  readyToComplete: number;        // mailboxes whose 14d elapsed but not yet checked
  earliestFinishAt: Date | null;
  latestFinishAt: Date | null;
  /** Plain-English state for the table cell. */
  label: "ready" | "warming" | "ready_to_check" | "unknown";
}
export function computeWarmupRollup(mailboxes: Mailbox[]): WarmupRollup {
  if (mailboxes.length === 0) {
    return { total: 0, completed: 0, warming: 0, readyToComplete: 0, earliestFinishAt: null, latestFinishAt: null, label: "unknown" };
  }
  const now = Date.now();
  let completed = 0, warming = 0, readyToComplete = 0;
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const m of mailboxes) {
    if (!m.smartlead_warmup_started_at) {
      warming++; // treat as still warming if started_at missing
      continue;
    }
    const finish = new Date(m.smartlead_warmup_started_at).getTime() + 14 * 24 * 60 * 60 * 1000;
    earliest = earliest === null ? finish : Math.min(earliest, finish);
    latest = latest === null ? finish : Math.max(latest, finish);
    if (m.smartlead_warmup_completed_at) completed++;
    else if (finish <= now) readyToComplete++;
    else warming++;
  }
  const label: WarmupRollup["label"] =
    completed === mailboxes.length ? "ready"
    : readyToComplete > 0 ? "ready_to_check"
    : warming > 0 ? "warming"
    : "unknown";
  return {
    total: mailboxes.length,
    completed, warming, readyToComplete,
    earliestFinishAt: earliest ? new Date(earliest) : null,
    latestFinishAt: latest ? new Date(latest) : null,
    label,
  };
}

// ============ STATUS COLOR HELPERS ============

export function statusColor(s: OrderStatus): string {
  switch (s) {
    case "pending_payment":
      return "text-gold";
    case "paid":
    case "provisioning":
      return "text-cyan";
    case "done_pre_unipile":
      return "text-blue";
    case "done":
      return "text-green";
    case "replacing":
      return "text-purple";
    case "cancelling":
    case "cancelled":
      return "text-textdim";
    case "failed":
      return "text-red";
  }
}

export function actionLabel(t: PendingActionType): string {
  return t.replace(/_/g, " ").toUpperCase();
}

/** User-facing label for a plan. Internally the column + Hypertide API still
 *  use 'entra'/'google'; this is purely for display so operators don't have to
 *  know that 'Entra' refers to Microsoft Outlook / M365. */
export function planLabel(plan: PlanType): string {
  return plan === "entra" ? "Outlook" : "Google";
}
export function planLabelUpper(plan: PlanType): string {
  return plan === "entra" ? "OUTLOOK" : "GOOGLE";
}
