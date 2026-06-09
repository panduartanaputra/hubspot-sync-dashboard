"use client";

import { useState } from "react";
import { Mailbox, PendingAction, actionLabel, fn } from "@/lib/hypertide";

interface Props {
  actions: PendingAction[];
  mailboxes: Mailbox[];
  onChange: () => void;
}

export default function PendingActionsList({ actions, mailboxes, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [masterChoice, setMasterChoice] = useState<Record<string, string>>({});

  const approvePayment = async (a: PendingAction) => {
    if (!a.domain_order_id) return;
    setBusy(a.id);
    try {
      await fn.approvePayment({ domain_order_ids: [a.domain_order_id] });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (a: PendingAction, payload?: Record<string, unknown>) => {
    setBusy(a.id);
    try {
      await fn.resolveAction({ pending_action_id: a.id, payload });
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (actions.length === 0) {
    return <div className="text-textdim text-xs label-eyebrow-dim">NO PENDING ACTIONS</div>;
  }

  return (
    <ul className="divide-y divide-border">
      {actions.map((a) => {
        const domainMailboxes = mailboxes.filter((m) => m.domain_order_id === a.domain_order_id);
        const domain = (a.payload as { domain?: string })?.domain ?? "—";
        return (
          <li key={a.id} className="py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="label-eyebrow text-gold w-44">{actionLabel(a.action_type)}</span>
              <span className="text-texthi text-xs">{domain}</span>
            </div>
            <div className="flex items-center gap-2">
              {a.action_type === "approve_payment" && (
                <button
                  onClick={() => approvePayment(a)}
                  disabled={busy === a.id}
                  className="px-3 py-1 border border-gold/60 text-gold hover:bg-gold/10 text-[10px] label-eyebrow disabled:opacity-30"
                >
                  APPROVE PAYMENT
                </button>
              )}
              {a.action_type === "select_master" && (
                <>
                  <select
                    value={masterChoice[a.id] ?? ""}
                    onChange={(e) => setMasterChoice({ ...masterChoice, [a.id]: e.target.value })}
                    className="bg-panel2 border border-border2 px-2 py-1 text-xs text-texthi"
                  >
                    <option value="">-- pick master --</option>
                    {domainMailboxes.map((m) => (
                      <option key={m.id} value={m.email}>
                        {m.email}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => resolve(a, { master_inbox: masterChoice[a.id] })}
                    disabled={busy === a.id || !masterChoice[a.id]}
                    className="px-3 py-1 border border-gold/60 text-gold hover:bg-gold/10 text-[10px] label-eyebrow disabled:opacity-30"
                  >
                    SET MASTER
                  </button>
                </>
              )}
              {a.action_type === "request_send_as" && (
                <button
                  onClick={() => resolve(a)}
                  disabled={busy === a.id}
                  className="px-3 py-1 border border-cyan/40 text-cyan hover:bg-cyan/10 text-[10px] label-eyebrow disabled:opacity-30"
                >
                  MARK REQUESTED
                </button>
              )}
              {a.action_type === "confirm_send_as" && (
                <button
                  onClick={() => resolve(a)}
                  disabled={busy === a.id}
                  className="px-3 py-1 border border-green/40 text-green hover:bg-green/10 text-[10px] label-eyebrow disabled:opacity-30"
                >
                  CONFIRM
                </button>
              )}
              {a.action_type === "connect_unipile" && (
                <button
                  onClick={() => resolve(a)}
                  disabled={busy === a.id}
                  className="px-3 py-1 border border-purple/40 text-purple hover:bg-purple/10 text-[10px] label-eyebrow disabled:opacity-30"
                >
                  STUB CONNECT
                </button>
              )}
              {a.action_type === "disconnect_unipile" && (
                <button
                  onClick={() => resolve(a)}
                  disabled={busy === a.id}
                  className="px-3 py-1 border border-textdim/40 text-textdim hover:bg-border2 text-[10px] label-eyebrow disabled:opacity-30"
                >
                  DISCONNECT
                </button>
              )}
              {a.action_type === "replace_approve" && (
                <button
                  onClick={() => resolve(a)}
                  disabled={busy === a.id}
                  className="px-3 py-1 border border-purple/60 text-purple hover:bg-purple/10 text-[10px] label-eyebrow disabled:opacity-30"
                >
                  APPROVE REPLACE
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
