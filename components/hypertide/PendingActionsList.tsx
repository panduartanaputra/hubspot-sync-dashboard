"use client";

import { useState } from "react";
import {
  DomainOrder,
  IntegrationConnection,
  Mailbox,
  PendingAction,
  actionLabel,
  fn,
} from "@/lib/hypertide";

interface Props {
  actions: PendingAction[];
  mailboxes: Mailbox[];
  orders: DomainOrder[];
  integrations: IntegrationConnection[];
  onChange: () => void;
}

/** Hypertide convention: the mailbox whose local part is exactly
 *  `firstname.lastname` is the admin user on a Google Workspace order.
 *  For Entra, no admin account is provisioned. */
function isLikelyGoogleAdmin(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return /^[a-z]+\.[a-z]+$/i.test(local);
}

const UNIPILE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "success", label: "Success" },
  { value: "fail_subscription_inactive", label: "Fail: Unipile subscription inactive" },
  { value: "fail_auth_refused", label: "Fail: OAuth refused / timed out" },
  { value: "fail_rate_limit", label: "Fail: Unipile rate limit" },
  { value: "fail_provider_error", label: "Fail: Microsoft/Google rejected" },
  { value: "fail_duplicate", label: "Fail: Mailbox already linked" },
];

export default function PendingActionsList({
  actions,
  mailboxes,
  orders,
  integrations,
  onChange,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [masterChoice, setMasterChoice] = useState<Record<string, string>>({});
  const [simChoice, setSimChoice] = useState<Record<string, string>>({});

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
        const order = orders.find((o) => o.id === a.domain_order_id);
        const isGoogle = order?.plan === "google";
        const masterMailbox = domainMailboxes.find((m) => m.is_master);
        const failedIntegration = masterMailbox
          ? integrations.find((i) => i.mailbox_id === masterMailbox.id && i.provider === "unipile" && i.status === "failed")
          : undefined;

        return (
          <li key={a.id} className="py-3">
            <div className="flex items-center justify-between gap-4">
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
                      {domainMailboxes.map((m) => {
                        const adminTag = isGoogle && isLikelyGoogleAdmin(m.email) ? " — ADMIN" : "";
                        return (
                          <option key={m.id} value={m.email}>
                            {m.email}{adminTag}
                          </option>
                        );
                      })}
                    </select>
                    {isGoogle && (
                      <span className="text-[10px] text-cyan label-eyebrow-dim ml-1">
                        pick firstname.lastname
                      </span>
                    )}
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
                  <>
                    <select
                      value={simChoice[a.id] ?? "success"}
                      onChange={(e) => setSimChoice({ ...simChoice, [a.id]: e.target.value })}
                      className="bg-panel2 border border-border2 px-2 py-1 text-xs text-texthi"
                      title="Mock-mode: choose how Unipile should respond"
                    >
                      {UNIPILE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => resolve(a, { simulate_result: simChoice[a.id] ?? "success" })}
                      disabled={busy === a.id}
                      className="px-3 py-1 border border-purple/40 text-purple hover:bg-purple/10 text-[10px] label-eyebrow disabled:opacity-30"
                    >
                      {failedIntegration ? "RETRY CONNECT" : "STUB CONNECT"}
                    </button>
                  </>
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
            </div>
            {/* Surface last failure for CONNECT UNIPILE */}
            {a.action_type === "connect_unipile" && failedIntegration && (
              <div className="mt-2 ml-44 pl-4 border-l-2 border-red/60 text-[11px]">
                <span className="label-eyebrow text-red mr-2">LAST CONNECT FAILED</span>
                <span className="text-red">{failedIntegration.last_error}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
