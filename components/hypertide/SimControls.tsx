"use client";

import { useState } from "react";
import { SimulationConfig, fn } from "@/lib/hypertide";

interface Props {
  sim: SimulationConfig | null;
  onChange: () => void;
}

const POLL_HELP = [
  "POLL ORDERS",
  "",
  "Asks Hypertide whether any paid orders have finished provisioning.",
  "",
  "When an order is reported as Done:",
  "  • status flips from paid → done_pre_unipile",
  "  • mailbox credentials are pulled in and saved",
  "  • 3 new pending actions open up per domain",
  "    (select master, request send-as, connect Unipile)",
  "",
  "In production this runs on a 15-min cron (currently disabled).",
  "Use the button to drive the simulation manually.",
].join("\n");

const TICK_HELP = [
  "TICK SIMULATION",
  "",
  "Pretends a day has gone by for the replacement loop.",
  "",
  "Each click:",
  "  • Generates a mock reply-rate per active domain",
  "    (starts ~4%, decays ~0.1pp/day, small random noise)",
  "  • Checks if any domain's 7-day avg reply rate is < 1.5%",
  "  • If so, opens a replacement job — auto-approved when",
  "    inside the client's monthly billing limit, otherwise",
  "    a 'replace_approve' pending action is created.",
  "",
  "Press repeatedly to fast-forward the health decay until",
  "the replacement flow triggers.",
  "",
  "In production this runs nightly at 02:00 UTC (currently disabled).",
].join("\n");

function HelpIcon({ tip }: { tip: string }) {
  return (
    <span
      title={tip}
      className="inline-flex items-center justify-center w-4 h-4 ml-1 rounded-full border border-textdim/40 text-textdim text-[9px] cursor-help hover:border-gold hover:text-gold"
      aria-label="help"
    >
      ?
    </span>
  );
}

export default function SimControls({ sim, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const wrap = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await action();
      setMsg(`${key}: ${JSON.stringify(r)}`);
      onChange();
    } catch (e) {
      setMsg(`${key} error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-[10px] label-eyebrow-dim">
        MODE: <span className="text-gold">{sim?.mode ?? "?"}</span> · DRY-RUN:{" "}
        <span className="text-gold">{sim?.force_dry_run ? "ON" : "OFF"}</span>
      </div>
      <div className="flex items-center">
        <button
          onClick={() => wrap("tick", () => fn.tick())}
          disabled={busy !== null}
          className="px-3 py-1.5 border border-cyan/40 text-cyan hover:bg-cyan/10 text-[10px] label-eyebrow disabled:opacity-30"
        >
          {busy === "tick" ? "TICKING…" : "TICK SIMULATION"}
        </button>
        <HelpIcon tip={TICK_HELP} />
      </div>
      <div className="flex items-center">
        <button
          onClick={() => wrap("poll", () => fn.pollOrders())}
          disabled={busy !== null}
          className="px-3 py-1.5 border border-blue/40 text-blue hover:bg-blue/10 text-[10px] label-eyebrow disabled:opacity-30"
        >
          {busy === "poll" ? "POLLING…" : "POLL ORDERS"}
        </button>
        <HelpIcon tip={POLL_HELP} />
      </div>
      {msg && <div className="text-textdim text-[10px] ml-2 truncate max-w-md">{msg}</div>}
    </div>
  );
}
