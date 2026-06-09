"use client";

import { useState } from "react";
import { DomainOrder, Mailbox, fn, statusColor } from "@/lib/hypertide";

interface Props {
  orders: DomainOrder[];
  mailboxes: Mailbox[];
  onChange: () => void;
}

export default function DomainOrdersTable({ orders, mailboxes, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const cancel = async (orderId: string) => {
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

  const revert = async (orderId: string) => {
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

  if (orders.length === 0) {
    return <div className="text-textdim text-xs label-eyebrow-dim">NO ORDERS YET</div>;
  }

  return (
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
        {orders.map((o) => {
          const mbs = mailboxes.filter((m) => m.domain_order_id === o.id);
          return (
            <tr key={o.id} className="border-b border-border hover:bg-panel2/40">
              <td className="py-2 text-texthi uppercase">{o.plan}</td>
              <td className="py-2 text-texthi">{o.domain}</td>
              <td className={`py-2 ${statusColor(o.status)}`}>● {o.status}</td>
              <td className="py-2 text-textdim">{o.master_inbox ?? "—"}</td>
              <td className="py-2 text-textdim">{mbs.length}</td>
              <td className="py-2 text-right space-x-2">
                {(o.status === "done" || o.status === "done_pre_unipile") && (
                  <button
                    onClick={() => cancel(o.id)}
                    disabled={busy === o.id}
                    className="px-2 py-1 border border-red/40 text-red hover:bg-red/10 text-[10px] label-eyebrow disabled:opacity-30"
                  >
                    CANCEL
                  </button>
                )}
                {o.status === "cancelling" && (
                  <button
                    onClick={() => revert(o.id)}
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
  );
}
