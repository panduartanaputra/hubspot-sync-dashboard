"use client";

import { useState } from "react";
import { fn } from "@/lib/hypertide";

interface Props {
  orderId: string;
  domain: string;
  masterInbox: string;
  defaultTo?: string;
  onClose: () => void;
}

export default function SendTestModal({ orderId, domain, masterInbox, defaultTo, onClose }: Props) {
  const [from, setFrom] = useState(masterInbox);
  const [displayName, setDisplayName] = useState("");
  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState("Test from Hypertide cockpit");
  const [body, setBody] = useState(`Test send from the cockpit at ${new Date().toISOString()}.`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!to.trim()) {
      setError("Recipient (To) is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fn.unipileSend({
        domain_order_id: orderId,
        to: to.trim(),
        from: from.trim() || undefined,
        display_name: displayName.trim() || undefined,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
      });
      if (res.success) {
        setResult(`Sent ✓ tracking_id=${res.tracking_id ?? "—"}`);
      } else {
        setError(`Failed: ${res.error ?? JSON.stringify(res.detail ?? res)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-bg/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="label-eyebrow text-gold mb-1">SEND TEST EMAIL</div>
            <div className="text-[11px] text-textdim">
              via <span className="font-mono text-text">{domain}</span> · master{" "}
              <span className="font-mono text-text">{masterInbox}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-textdim hover:text-texthi text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <Field label="FROM (alias on this domain)">
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={masterInbox}
              className="w-full bg-panel2 border border-border2 px-2 py-1.5 text-xs text-texthi font-mono"
            />
          </Field>
          <Field label="DISPLAY NAME (optional)">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Mary Popp"
              className="w-full bg-panel2 border border-border2 px-2 py-1.5 text-xs text-texthi"
            />
          </Field>
          <Field label="TO">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full bg-panel2 border border-border2 px-2 py-1.5 text-xs text-texthi font-mono"
            />
          </Field>
          <Field label="SUBJECT">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-panel2 border border-border2 px-2 py-1.5 text-xs text-texthi"
            />
          </Field>
          <Field label="BODY">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full bg-panel2 border border-border2 px-2 py-1.5 text-xs text-texthi resize-y"
            />
          </Field>
        </div>

        {result && (
          <div className="mt-4 px-3 py-2 border border-green/60 text-green text-[11px]">{result}</div>
        )}
        {error && (
          <div className="mt-4 px-3 py-2 border border-red/60 text-red text-[11px]">{error}</div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-textdim/40 text-textdim hover:bg-panel2 text-[10px] label-eyebrow"
          >
            CLOSE
          </button>
          <button
            onClick={send}
            disabled={busy}
            className="px-3 py-1.5 border border-gold/60 text-gold hover:bg-gold/10 text-[10px] label-eyebrow disabled:opacity-30"
          >
            {busy ? "SENDING…" : "SEND"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block label-eyebrow-dim text-[10px] mb-1">{label}</label>
      {children}
    </div>
  );
}
