"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OnboardForm from "@/components/hypertide/OnboardForm";
import DomainOrdersTable from "@/components/hypertide/DomainOrdersTable";
import PendingActionsList from "@/components/hypertide/PendingActionsList";
import SimControls from "@/components/hypertide/SimControls";
import {
  BillingConfig,
  Client,
  DomainOrder,
  JobLogRow,
  Mailbox,
  PendingAction,
  SimulationConfig,
  fetchBilling,
  fetchClients,
  fetchDomainOrders,
  fetchJobLog,
  fetchMailboxes,
  fetchPendingActions,
  fetchSimConfig,
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
      const [m, a] = await Promise.all([fetchMailboxes(orderIds), fetchPendingActions(activeClientId)]);
      setMailboxes(m);
      setActions(a);
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

  return (
    <main className="min-h-screen px-8 py-7 max-w-[1600px] mx-auto">
      {/* Header bar */}
      <header className="flex items-end justify-between mb-8 pb-5 border-b border-border">
        <div>
          <div className="label-eyebrow mb-1.5">METIS · HYPERTIDE INFRASTRUCTURE</div>
          <h1 className="font-serif text-[26px] font-bold text-texthi leading-none">Domain & Inbox Cockpit</h1>
          <p className="text-xs text-textdim mt-2">
            Provisioning, Send-As setup, and replacement loops across Hypertide Entra + Google plans.
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
                </option>
              ))}
            </select>
          </div>
          <Link href="/" className="text-xs text-textdim hover:text-gold label-eyebrow-dim">
            ← SYNC COCKPIT
          </Link>
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
          <section className="mb-6 border border-border bg-panel p-4 flex items-center justify-between">
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
          </section>

          {/* Onboard new */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="label-eyebrow text-gold mb-3">ONBOARD NEW</div>
            <OnboardForm clientId={activeClient.id} onDone={refresh} />
          </section>

          {/* Orders */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="label-eyebrow text-gold">DOMAIN ORDERS · {orders.length}</div>
            </div>
            <DomainOrdersTable orders={orders} mailboxes={mailboxes} onChange={refresh} />
          </section>

          {/* Pending Actions */}
          <section className="mb-6 border border-border bg-panel p-4">
            <div className="label-eyebrow text-gold mb-3">PENDING ACTIONS · {actions.length}</div>
            <PendingActionsList actions={actions} mailboxes={mailboxes} onChange={refresh} />
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
    </main>
  );
}
