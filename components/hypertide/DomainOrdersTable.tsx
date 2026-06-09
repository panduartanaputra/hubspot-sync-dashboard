"use client";

import { useMemo, useState } from "react";
import {
  DomainOrder,
  IntegrationConnection,
  Mailbox,
  fn,
  planLabelUpper,
  statusColor,
} from "@/lib/hypertide";

interface Props {
  orders: DomainOrder[];
  mailboxes: Mailbox[];
  integrations: IntegrationConnection[];
  onChange: () => void;
}

type FilterMode = "active" | "history" | "all";

const ACTIVE_STATUSES = new Set([
  "pending_payment",
  "paid",
  "provisioning",
  "done_pre_unipile",
  "done",
  "replacing",
  "cancelling",
]);
const HISTORY_STATUSES = new Set(["cancelled", "failed"]);

export default function DomainOrdersTable({ orders, mailboxes, integrations, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("active");

  const deactivate = async (orderId: string, domain: string) => {
    if (!confirm(`Start the wind-down for "${domain}"?\n\nThis kicks off a 24-hour countdown. Nothing actually changes during those 24 hours — you can hit REVERT at any time to undo this. After 24 hours: the Hypertide subscription is cancelled, mailboxes are removed from Smartlead, and Unipile is disconnected.`)) return;
    setBusy(orderId);
    try {
      await fn.cancelSubscription({ action: "cancel", domain_order_ids: [orderId] });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const revert = async (orderId: string, domain: string) => {
    if (!confirm(`Cancel the wind-down for "${domain}"?\n\nThe order goes back to fully active. Because the 24-hour countdown hasn't finished, nothing was actually changed — no need to redo any setup.`)) return;
    setBusy(orderId);
    try {
      await fn.cancelSubscription({ action: "revert", domain_order_ids: [orderId] });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const discard = async (orderId: string, domain: string) => {
    if (!confirm(`Drop the unpaid order for "${domain}"?\n\nNothing was charged yet, so this just removes it from our list. Hypertide is not affected.`)) return;
    setBusy(orderId);
    try {
      await fn.discardOrder({ domain_order_id: orderId });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    let active = 0;
    let history = 0;
    for (const o of orders) {
      if (ACTIVE_STATUSES.has(o.status)) active++;
      else if (HISTORY_STATUSES.has(o.status)) history++;
    }
    return { active, history, all: orders.length };
  }, [orders]);

  const snapshot = useMemo(() => {
    const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
    const entra = activeOrders.filter((o) => o.plan === "entra").length;
    const google = activeOrders.filter((o) => o.plan === "google").length;
    const activeOrderIds = new Set(activeOrders.map((o) => o.id));
    const activeMailboxes = mailboxes.filter((m) => activeOrderIds.has(m.domain_order_id));
    const activeMailboxIds = new Set(activeMailboxes.map((m) => m.id));
    const unipileConnected = integrations.filter(
      (i) => i.provider === "unipile" && i.status === "connected" && activeMailboxIds.has(i.mailbox_id)
    ).length;
    return { entra, google, mailboxes: activeMailboxes.length, unipileConnected };
  }, [orders, mailboxes, integrations]);

  const visibleOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "active") return orders.filter((o) => ACTIVE_STATUSES.has(o.status));
    return orders.filter((o) => HISTORY_STATUSES.has(o.status));
  }, [orders, filter]);

  return (
    <div>
      {/* Snapshot */}
      <div className="mb-3 text-[11px] text-textdim">
        <span className="label-eyebrow-dim mr-2">SNAPSHOT</span>
        ACTIVE: <span className="text-texthi">{snapshot.entra}</span> Outlook ·{" "}
        <span className="text-texthi">{snapshot.google}</span> Google ·{" "}
        <span className="text-texthi">{snapshot.mailboxes}</span> mailboxes ·{" "}
        <span className={snapshot.unipileConnected > 0 ? "text-green" : "text-textdim2"}>
          {snapshot.unipileConnected}
        </span>{" "}
        connected to Unipile
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4">
        <FilterChip current={filter} value="active" count={counts.active} onClick={setFilter}>
          ACTIVE
        </FilterChip>
        <FilterChip current={filter} value="history" count={counts.history} onClick={setFilter}>
          HISTORY
        </FilterChip>
        <FilterChip current={filter} value="all" count={counts.all} onClick={setFilter}>
          ALL
        </FilterChip>
      </div>

      {visibleOrders.length === 0 ? (
        <div className="text-textdim text-xs label-eyebrow-dim py-2">
          {filter === "active"
            ? "NO ACTIVE DOMAINS"
            : filter === "history"
            ? "NO HISTORY YET"
            : "NO ORDERS YET"}
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-textdim2">
            <tr className="border-b border-border">
              <th className="text-left py-2 label-eyebrow-dim">PLAN</th>
              <th className="text-left py-2 label-eyebrow-dim">DOMAIN</th>
              <th className="text-left py-2 label-eyebrow-dim">STATUS</th>
              <th className="text-left py-2 label-eyebrow-dim">MASTER INBOX</th>
              <th className="text-left py-2 label-eyebrow-dim">MAILBOXES</th>
              <th className="text-right py-2 label-eyebrow-dim">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map((o) => {
              const mbs = mailboxes.filter((m) => m.domain_order_id === o.id);
              const countdown = formatCountdown(o.cancellation_scheduled_at);
              return (
                <tr key={o.id} className="border-b border-border hover:bg-panel2/40">
                  <td className="py-2 text-texthi">{planLabelUpper(o.plan)}</td>
                  <td className="py-2 text-texthi">{o.domain}</td>
                  <td className={`py-2 ${statusColor(o.status)}`}>
                    ● {o.status}
                    {o.status === "cancelling" && countdown && (
                      <span className="ml-2 text-[10px] text-textdim2">{countdown}</span>
                    )}
                    {o.status === "cancelled" && o.smartlead_removal_status === "failed" && (
                      <span className="ml-2 text-[10px] text-red label-eyebrow">SMARTLEAD FAILED</span>
                    )}
                  </td>
                  <td className="py-2 text-textdim">{o.master_inbox ?? "—"}</td>
                  <td className="py-2 text-textdim">{mbs.length}</td>
                  <td className="py-2 text-right space-x-2">
                    {o.status === "pending_payment" && (
                      <button
                        onClick={() => discard(o.id, o.domain)}
                        disabled={busy === o.id}
                        className="px-2 py-1 border border-textdim/40 text-textdim hover:bg-panel2 text-[10px] label-eyebrow disabled:opacity-30"
                      >
                        DISCARD
                      </button>
                    )}
                    {o.status === "done" && (
                      <button
                        onClick={() => deactivate(o.id, o.domain)}
                        disabled={busy === o.id}
                        className="px-2 py-1 border border-red/40 text-red hover:bg-red/10 text-[10px] label-eyebrow disabled:opacity-30"
                        title="Schedule a Stripe subscription cancellation and start the wind-down chain. Use REVERT if you change your mind before it executes."
                      >
                        DEACTIVATE
                      </button>
                    )}
                    {o.status === "cancelling" && (
                      <button
                        onClick={() => revert(o.id, o.domain)}
                        disabled={busy === o.id}
                        className="px-2 py-1 border border-blue/40 text-blue hover:bg-blue/10 text-[10px] label-eyebrow disabled:opacity-30"
                      >
                        REVERT
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatCountdown(scheduledAt: string | null): string | null {
  if (!scheduledAt) return null;
  const finalizeAt = new Date(scheduledAt).getTime() + 24 * 60 * 60 * 1000;
  const diff = finalizeAt - Date.now();
  if (diff <= 0) return "READY TO FINALIZE";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `finalizes in ${hours}h ${minutes}m`;
}

function FilterChip({
  current,
  value,
  count,
  onClick,
  children,
}: {
  current: FilterMode;
  value: FilterMode;
  count: number;
  onClick: (v: FilterMode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1 text-[10px] label-eyebrow border transition-colors ${
        active
          ? "border-gold/60 text-gold bg-gold/10"
          : "border-border2 text-textdim hover:bg-panel2 hover:text-text"
      }`}
    >
      {children} · <span className="font-bold">{count}</span>
    </button>
  );
}
