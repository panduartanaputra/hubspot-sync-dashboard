"use client";

import { useState } from "react";
import { fn } from "@/lib/hypertide";

interface Props {
  clientId: string;
  onDone: () => void;
}

export default function OnboardForm({ clientId, onDone }: Props) {
  const [entra, setEntra] = useState("");
  const [google, setGoogle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const entraTrim = entra.trim().toLowerCase();
  const googleTrim = google.trim().toLowerCase();
  const duplicate = entraTrim !== "" && entraTrim === googleTrim;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entra || !google) return;
    if (duplicate) {
      setErr("Entra and Google domains must be different — a domain cannot exist on both M365 and Google Workspace at the same time.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await fn.createOnboarding({ client_id: clientId, entra_domain: entraTrim, google_domain: googleTrim });
      setEntra("");
      setGoogle("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label-eyebrow-dim block mb-1">ENTRA DOMAIN</label>
          <input
            value={entra}
            onChange={(e) => setEntra(e.target.value)}
            placeholder="outreach-entra.com"
            className={`bg-panel2 border px-3 py-2 text-xs text-texthi w-56 outline-none ${
              duplicate ? "border-red focus:border-red" : "border-border2 focus:border-gold"
            }`}
            disabled={busy}
          />
        </div>
        <div>
          <label className="label-eyebrow-dim block mb-1">GOOGLE DOMAIN</label>
          <input
            value={google}
            onChange={(e) => setGoogle(e.target.value)}
            placeholder="outreach-google.com"
            className={`bg-panel2 border px-3 py-2 text-xs text-texthi w-56 outline-none ${
              duplicate ? "border-red focus:border-red" : "border-border2 focus:border-gold"
            }`}
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !entra || !google || duplicate}
          className="px-4 py-2 text-xs label-eyebrow border border-gold/60 text-gold hover:bg-gold/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy ? "STARTING…" : "START ONBOARDING"}
        </button>
        {duplicate && (
          <div className="text-red text-xs ml-2">DOMAINS MUST BE DIFFERENT</div>
        )}
        {err && !duplicate && <div className="text-red text-xs ml-2">{err}</div>}
      </form>
      <div className="text-[10px] text-textdim mt-3 leading-relaxed">
        Mode: <span className="text-gold">purchase_domain_for_me</span> ·{" "}
        Check availability in the{" "}
        <a
          href="https://app2.hypertide.io/select-domains"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold hover:underline"
        >
          Hypertide dashboard
        </a>{" "}
        first (login required) · Supported TLDs:{" "}
        <span className="text-text">.com / .net / .org / .info / .biz</span>
      </div>
    </div>
  );
}
