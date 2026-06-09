"use client";

import { useState } from "react";
import { fn } from "@/lib/hypertide";

interface Props {
  clientId: string;
  burnedDomains: string[];        // lowercase domain strings of cancelled/failed prior orders
  activePlans: Array<"entra" | "google">; // which plans this client already has an in-flight order on
  onDone: () => void;
}

export default function OnboardForm({ clientId, burnedDomains, activePlans, onDone }: Props) {
  const [entra, setEntra] = useState("");
  const [google, setGoogle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmingBurn, setConfirmingBurn] = useState(false);

  const entraLocked = activePlans.includes("entra");
  const googleLocked = activePlans.includes("google");

  const entraTrim = entra.trim().toLowerCase();
  const googleTrim = google.trim().toLowerCase();

  const nothingFilled = entraTrim === "" && googleTrim === "";
  const duplicate =
    entraTrim !== "" && googleTrim !== "" && entraTrim === googleTrim;

  const burnedSet = new Set(burnedDomains.map((d) => d.toLowerCase()));
  const entraBurned = entraTrim !== "" && burnedSet.has(entraTrim);
  const googleBurned = googleTrim !== "" && burnedSet.has(googleTrim);
  const anyBurned = entraBurned || googleBurned;

  const isDotCom = (d: string) => d !== "" && d.endsWith(".com");
  const entraNonDotCom = entraTrim !== "" && !isDotCom(entraTrim);
  const googleNonDotCom = googleTrim !== "" && !isDotCom(googleTrim);

  const actuallySubmit = async () => {
    setBusy(true);
    setErr(null);
    setConfirmingBurn(false);
    try {
      await fn.createOnboarding({
        client_id: clientId,
        entra_domain: entraLocked ? "" : entraTrim,
        google_domain: googleLocked ? "" : googleTrim,
      });
      setEntra("");
      setGoogle("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nothingFilled) return;
    if (duplicate) {
      setErr("Entra and Google domains must be different.");
      return;
    }
    if (anyBurned) {
      setConfirmingBurn(true);
      return;
    }
    await actuallySubmit();
  };

  const buttonLabel = (() => {
    if (busy) return "STARTING…";
    const filled = [
      entraTrim && !entraLocked ? "ENTRA" : null,
      googleTrim && !googleLocked ? "GOOGLE" : null,
    ].filter(Boolean);
    if (filled.length === 0) return "START ONBOARDING";
    return `START ${filled.join(" + ")}`;
  })();

  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label-eyebrow-dim block mb-1">
            ENTRA DOMAIN {entraLocked && <span className="text-textdim2">(already active)</span>}
          </label>
          <input
            value={entra}
            onChange={(e) => setEntra(e.target.value)}
            placeholder={entraLocked ? "—" : "outreach-entra.com"}
            className={`bg-panel2 border px-3 py-2 text-xs w-56 outline-none ${
              entraLocked
                ? "border-border text-textdim2 cursor-not-allowed"
                : duplicate
                ? "border-red text-texthi focus:border-red"
                : entraBurned
                ? "border-purple text-texthi focus:border-purple"
                : "border-border2 text-texthi focus:border-gold"
            }`}
            disabled={busy || entraLocked}
          />
          {entraBurned && !duplicate && !entraLocked && (
            <div className="text-purple text-[10px] mt-1 label-eyebrow">BURNED PREVIOUSLY</div>
          )}
          {entraNonDotCom && !entraBurned && !duplicate && !entraLocked && (
            <div className="text-gold text-[10px] mt-1 label-eyebrow">NON-.COM · MAY HURT DELIVERABILITY</div>
          )}
        </div>
        <div>
          <label className="label-eyebrow-dim block mb-1">
            GOOGLE DOMAIN {googleLocked && <span className="text-textdim2">(already active)</span>}
          </label>
          <input
            value={google}
            onChange={(e) => setGoogle(e.target.value)}
            placeholder={googleLocked ? "—" : "outreach-google.com"}
            className={`bg-panel2 border px-3 py-2 text-xs w-56 outline-none ${
              googleLocked
                ? "border-border text-textdim2 cursor-not-allowed"
                : duplicate
                ? "border-red text-texthi focus:border-red"
                : googleBurned
                ? "border-purple text-texthi focus:border-purple"
                : "border-border2 text-texthi focus:border-gold"
            }`}
            disabled={busy || googleLocked}
          />
          {googleBurned && !duplicate && !googleLocked && (
            <div className="text-purple text-[10px] mt-1 label-eyebrow">BURNED PREVIOUSLY</div>
          )}
          {googleNonDotCom && !googleBurned && !duplicate && !googleLocked && (
            <div className="text-gold text-[10px] mt-1 label-eyebrow">NON-.COM · MAY HURT DELIVERABILITY</div>
          )}
        </div>
        <button
          type="submit"
          disabled={busy || nothingFilled || duplicate}
          className="px-4 py-2 text-xs label-eyebrow border border-gold/60 text-gold hover:bg-gold/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {buttonLabel}
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
        first (login required) · Recommended TLD:{" "}
        <span className="text-text">.com</span>{" "}
        <span className="text-textdim2">(best deliverability; .net/.org/.info/.biz are accepted by Hypertide but discouraged)</span> ·{" "}
        <span className="text-textdim2">Fill only the plan(s) you need — empty fields are skipped.</span>
      </div>

      {/* Burned-domain confirmation overlay */}
      {confirmingBurn && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8">
          <div className="bg-panel border border-purple/60 max-w-lg w-full p-6">
            <div className="label-eyebrow text-purple mb-3">⚠ BURNED DOMAIN WARNING</div>
            <p className="text-xs text-text mb-4 leading-relaxed">
              The following domain{entraBurned && googleBurned ? "s have" : " has"} previously
              been used and retired for this client:
            </p>
            <ul className="mb-4 text-xs space-y-1 font-mono">
              {entraBurned && (
                <li className="text-purple">• {entraTrim} <span className="text-textdim2">(Entra)</span></li>
              )}
              {googleBurned && (
                <li className="text-purple">• {googleTrim} <span className="text-textdim2">(Google)</span></li>
              )}
            </ul>
            <p className="text-xs text-textdim mb-6 leading-relaxed">
              Re-buying a burned domain usually carries reputation risk (spam blacklists, low
              deliverability). Only proceed if you have a specific reason.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmingBurn(false)}
                className="px-4 py-2 text-xs label-eyebrow border border-border2 text-textdim hover:bg-panel2"
              >
                CANCEL
              </button>
              <button
                onClick={actuallySubmit}
                className="px-4 py-2 text-xs label-eyebrow border border-purple/60 text-purple hover:bg-purple/10"
              >
                PROCEED ANYWAY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
