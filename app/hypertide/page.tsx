"use client";

import { useCallback, useEffect, useState } from "react";
import OnboardForm from "@/components/hypertide/OnboardForm";
import DomainOrdersTable from "@/components/hypertide/DomainOrdersTable";
import PendingActionsList from "@/components/hypertide/PendingActionsList";
import SimControls from "@/components/hypertide/SimControls";
import BurnedDomainsTable from "@/components/hypertide/BurnedDomainsTable";
import HelpIcon from "@/components/hypertide/HelpIcon";

const FAST_FORWARD_HELP = {
  title: "FAST-FORWARD WARMUP (15d)",
  body: [
    "Simulation only.",
    "",
    "Backdates warmup_started_at on every mailbox of this client by 15 days so the next CHECK WARMUP marks them as completed immediately.",
    "",
    "In production, Smartlead's 14-day warm-up just runs naturally — this button has no real-flow equivalent.",
  ],
};

const RESET_CLIENT_HELP = {
  title: "RESET CLIENT",
  body: [
    "Simulation only.",
    "",
    "Wipes every order, mailbox, pending action, integration, metric, and log entry for this client so the demo can start from a clean slate.",
    "",
    "In production there is no equivalent: real domains and mailboxes are wound down through OFFBOARD CLIENT / DEACTIVATE only.",
  ],
};
import {
  BillingConfig,
  Client,
  DomainOrder,
  JobLogRow,
  Mailbox,
  PendingAction,
  SimulationConfig,
  IntegrationConnection,
  fetchBilling,
  fetchBurnedDomains,
  fetchClients,
  fetchDomainOrders,
  fetchIntegrations,
  fetchJobLog,
  fetchMailboxes,
  fetchPendingActions,
  fetchSimConfig,
  fn,
} from "@/lib/hypertide";

export default function HypertidePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  const [orders, setOrders] = useState<DomainOrder[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [sim, setSim] = useState<SimulationConfig | null>(null);
  const [jobLog, setJobLog] = useState<JobLogRow[]>([]);
  const [burned, setBurned] = useState<DomainOrder[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const [confirmOffboard, setConfirmOffboard] = useState(false);
  const [offboardingBusy, setOffboardingBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      const c = await fetchClients();
      setClients(c);
      if (!activeClientId && c.length > 0) setActiveClientId(c[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [activeClientId]);

  const refresh = useCallback(async () => {
    if (!activeClientId) return;
    try {
      const [b, o, s, l] = await Promise.all([
        fetchBilling(activeClientId),
        fetchDomainOrders(activeClientId),
        fetchSimConfig(),
        fetchJobLog(15),
      ]);
      setBilling(b);
      setOrders(o);
      setSim(s);
      setJobLog(l);
      const orderIds = o.map((x) => x.id);
      const [m, a, bd] = await Promise.all([
        fetchMailboxes(orderIds),
        fetchPendingActions(activeClientId),
        fetchBurnedDomains(activeClientId),
      ]);
      setMailboxes(m);
      setActions(a);
      setBurned(bd);
      const integ = await fetchIntegrations(m.map((mb) => mb.id));
      setIntegrations(integ);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;
  const isOffboarded = activeClient?.status === "offboarded";
  const activeOrderCount = orders.filter((o) =>
    ["pending_payment", "paid", "provisioning", "done_pre_unipile", "done", "replacing", "cancelling"].includes(o.status)
  ).length;

  const runOffboardClient = async () => {
    if (!activeClient) return;
    setOffboardingBusy(true);
    try {
      await fn.offboardClient({ client_id: activeClient.id });
      setConfirmOffboard(false);
      refresh();
      loadClients();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setOffboardingBusy(false);
    }
  };

  const runResetClient = async () => {
    if (!activeClient) return;
    setResetBusy(true);
    setResetMsg(null);
    try {
      const r = await fn.resetClient({ client_id: activeClient.id });
      setResetMsg(`Reset complete: removed ${r.removed.orders} orders, ${r.removed.mailboxes} mailboxes, ${r.removed.pending_actions} pending actions.`);
      setConfirmReset(false);
      refresh();
      loadClients();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <main className="min-h-screen px-8 py-7 max-w-[1600px] mx-auto">
      {/* Header bar */}
      <header className="flex items-end justify-between mb-8 pb-5 border-b border-border">
        <div>
          <div className="label-eyebrow mb-1.5">METIS · HYPERTIDE INFRASTRUCTURE</div>
          <h1 className="font-serif text-[26px] font-bold text-texthi leading-none">Domain & Inbox Cockpit</h1>
          <p className="text-xs text-textdim mt-2">
            Provisioning, Send-As setup, and replacement loops across Hypertide Outlook + Google plans.
          </p>
        </div>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <div className="label-eyebrow-dim">CLIENT</div>
            <select
              value={activeClientId ?? ""}
              onChange={(e) => setActiveClientId(e.target.value || null)}
              className="bg-panel2 border border-border2 px-2 py-1 text-xs text-texthi mt-1"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "offboarded" ? " · OFFBOARDED" : ""}
                </option>
              ))}
            </select>
          </div>
          {activeClient && (
            isOffboarded ? (
              <span className="text-[10px] label-eyebrow text-red border border-red/40 px-2 py-1 self-end">
                OFFBOARDED
              </span>
            ) : (
              <button
                onClick={() => setConfirmOffboard(true)}
                className="text-[10px] label-eyebrow text-red border border-red/40 px-2 py-1 hover:bg-red/10 self-end"
                title="Wind down all active domain orders for this client + mark the client as offboarded."
              >
                OFFBOARD CLIENT
              </button>
            )
          )}
        </div>
      </header>

      {err && (
        <div className="mb-6 px-4 py-3 border border-red/40 bg-red/5 text-red text-xs">
          <span className="label-eyebrow text-red mr-2">ERROR</span>
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-textdim text-xs label-eyebrow-dim">LOADING…</div>
      ) : !activeClient ? (
        <div className="text-textdim text-xs label-eyebrow-dim">NO CLIENT SELECTED</div>
      ) : (
        <>
          {/* Simulation strip */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="label-eyebrow text-gold mb-1">SIMULATION</div>
                <div className="text-xs text-textdim">
                  {activeClient.name} · forwarding {activeClient.forwarding_domain} · monthly limit $
                  {billing?.monthly_limit_usd ?? "—"} · auto-replace{" "}
                  <span className={billing?.auto_replace_enabled ? "text-green" : "text-textdim"}>
                    {billing?.auto_replace_enabled ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
              <SimControls sim={sim} onChange={refresh} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="text-[10px] text-textdim2 label-eyebrow-dim">
                DEMO TOOLS · only available in full_mock mode
              </div>
              <div className="flex items-center gap-3">
                {resetMsg && (
                  <span className="text-[10px] text-green">{resetMsg}</span>
                )}
                <button
                  onClick={async () => {
                    try {
                      const r = await fn.fastForwardWarmup({ client_id: activeClient.id, days: 15 });
                      setResetMsg(`Fast-forwarded warmup on ${r.updated} mailboxes by 15 days. Click CHECK WARMUP to roll up.`);
                      refresh();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="px-3 py-1.5 border border-green/40 text-green hover:bg-green/10 text-[10px] label-eyebrow"
                >
                  FAST-FORWARD WARMUP (15d)
                </button>
                <HelpIcon help={FAST_FORWARD_HELP} tone="green" />
                <button
                  onClick={() => setConfirmReset(true)}
                  className="px-3 py-1.5 border border-red/40 text-red hover:bg-red/10 text-[10px] label-eyebrow"
                >
                  RESET {activeClient.name.toUpperCase()}
                </button>
                <HelpIcon help={RESET_CLIENT_HELP} tone="red" />
              </div>
            </div>
          </section>

          {/* Onboard new */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="label-eyebrow text-gold">ONBOARD NEW</div>
              <div className="text-[10px] label-eyebrow-dim">
                CLIENT BASE DOMAIN:{" "}
                <span className="font-mono text-cyan tracking-normal normal-case">
                  {activeClient.forwarding_domain}
                </span>
              </div>
            </div>
            <div className="mb-4 px-3 py-2 border border-border2 bg-panel2 text-xs text-textdim">
              Use{" "}
              <span className="text-cyan font-mono">{activeClient.forwarding_domain}</span>{" "}
              as the basis for the new outreach domains you purchase from Hypertide
              (e.g. <span className="text-text">try-{activeClient.forwarding_domain.split(".")[0]}.com</span>,{" "}
              <span className="text-text">go-{activeClient.forwarding_domain.split(".")[0]}.com</span>).
            </div>
            <OnboardForm
              clientId={activeClient.id}
              burnedDomains={burned.map((b) => b.domain)}
              activePlans={
                orders
                  .filter((o) =>
                    [
                      "pending_payment",
                      "paid",
                      "provisioning",
                      "done_pre_unipile",
                      "done",
                      "replacing",
                    ].includes(o.status)
                  )
                  .map((o) => o.plan)
              }
              cancellingPlans={
                orders
                  .filter((o) => o.status === "cancelling")
                  .map((o) => o.plan)
              }
              activeDomains={orders
                .filter((o) => !["cancelled", "failed"].includes(o.status))
                .map((o) => o.domain.toLowerCase())}
              onDone={refresh}
            />
          </section>

          {/* Burned domains */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="label-eyebrow text-purple mb-3">
              BURNED DOMAINS · {burned.length}
              <span className="label-eyebrow-dim ml-3 font-normal normal-case">
                domains previously retired for this client — avoid re-buying
              </span>
            </div>
            <BurnedDomainsTable domains={burned} />
          </section>

          {/* Orders */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="label-eyebrow text-gold">DOMAIN ORDERS · {orders.length}</div>
            </div>
            <DomainOrdersTable
              orders={orders}
              mailboxes={mailboxes}
              integrations={integrations}
              onChange={refresh}
            />
          </section>

          {/* Pending Actions */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="label-eyebrow text-gold mb-3">PENDING ACTIONS · {actions.length}</div>
            <PendingActionsList
              actions={actions}
              mailboxes={mailboxes}
              orders={orders}
              integrations={integrations}
              simMode={sim?.mode ?? "full_mock"}
              onChange={refresh}
            />
          </section>

          {/* Job log */}
          <section className="border border-border bg-panel p-4">
            <div className="label-eyebrow text-gold mb-3">JOB LOG · LATEST {jobLog.length}</div>
            <ul className="divide-y divide-border text-xs">
              {jobLog.map((j) => (
                <li key={j.id} className="py-2 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={j.success ? "text-green" : "text-red"}>●</span>
                    <span className="text-textdim w-44 truncate">{j.action}</span>
                    <span className="text-textdim2 truncate">{j.entity_type}</span>
                    {j.dry_run && <span className="text-[10px] label-eyebrow text-gold">DRY</span>}
                  </div>
                  <span className="text-textdim2 text-[10px]">{new Date(j.created_at).toLocaleTimeString()}</span>
                </li>
              ))}
              {jobLog.length === 0 && (
                <li className="py-2 text-textdim label-eyebrow-dim">NO JOBS YET</li>
              )}
            </ul>
          </section>
        </>
      )}

      {/* RESET CLIENT confirmation modal */}
      {confirmReset && activeClient && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8">
          <div className="bg-panel border border-red/60 max-w-lg w-full p-6">
            <div className="label-eyebrow text-red mb-3">⚠ RESET DEMO DATA</div>
            <p className="text-xs text-text mb-2 leading-relaxed">
              Wipe all simulation data for <span className="text-gold font-bold">{activeClient.name}</span>?
            </p>
            <p className="text-xs text-textdim mb-4 leading-relaxed">
              This deletes every order, mailbox, pending action, integration, metric, and log entry
              tied to this client, and sets the client back to <span className="text-text">active</span>.
              The client row itself stays. Other clients are untouched.
              <br /><br />
              Use this to start the demo from scratch. <span className="text-red">Cannot be undone.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmReset(false)}
                disabled={resetBusy}
                className="px-4 py-2 text-xs label-eyebrow border border-border2 text-textdim hover:bg-panel2 disabled:opacity-30"
              >
                CANCEL
              </button>
              <button
                onClick={runResetClient}
                disabled={resetBusy}
                className="px-4 py-2 text-xs label-eyebrow border border-red/60 text-red hover:bg-red/10 disabled:opacity-30"
              >
                {resetBusy ? "RESETTING…" : "RESET"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFBOARD CLIENT confirmation modal */}
      {confirmOffboard && activeClient && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8">
          <div className="bg-panel border border-red/60 max-w-lg w-full p-6">
            <div className="label-eyebrow text-red mb-3">⚠ OFFBOARD CLIENT</div>
            <p className="text-xs text-text mb-2 leading-relaxed">
              You're about to offboard <span className="text-gold font-bold">{activeClient.name}</span>.
            </p>
            <p className="text-xs text-textdim mb-4 leading-relaxed">
              Start the wind-down for all{" "}
              <span className="text-cyan">{activeOrderCount}</span> active
              domain{activeOrderCount === 1 ? "" : "s"} this client has.
              <br /><br />
              <span className="text-text">For the next 24 hours nothing actually changes</span> — you can REVERT
              any individual domain if you change your mind. After 24 hours, every domain gets cancelled at
              Hypertide, mailboxes are removed from Smartlead, and Unipile is disconnected.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmOffboard(false)}
                disabled={offboardingBusy}
                className="px-4 py-2 text-xs label-eyebrow border border-border2 text-textdim hover:bg-panel2 disabled:opacity-30"
              >
                CANCEL
              </button>
              <button
                onClick={runOffboardClient}
                disabled={offboardingBusy}
                className="px-4 py-2 text-xs label-eyebrow border border-red/60 text-red hover:bg-red/10 disabled:opacity-30"
              >
                {offboardingBusy ? "OFFBOARDING…" : "OFFBOARD"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
