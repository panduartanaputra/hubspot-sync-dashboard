"use client";

import { useState } from "react";
import { SimulationConfig, fn } from "@/lib/hypertide";

interface Props {
  sim: SimulationConfig | null;
  onChange: () => void;
}

const POLL_HELP = {
  title: "POLL ORDERS",
  body: [
    "Asks Hypertide whether any paid orders have finished provisioning.",
    "",
    "When an order is reported as Done:",
    "• status flips paid → done_pre_unipile",
    "• mailbox credentials are pulled in and saved",
    "• 3 new pending actions open per domain (select master, request send-as, connect Unipile)",
    "",
    "In production this runs on a 15-min cron (currently disabled). Use the button to drive simulation manually.",
  ],
};

const TICK_HELP = {
  title: "TICK SIMULATION",
  body: [
    "Pretends a day has gone by for the replacement loop.",
    "",
    "Each click:",
    "• Generates a mock reply-rate per active domain (~4% start, decays ~0.1pp/day, small random noise)",
    "• Checks if 7-day avg < 1.5% per domain",
    "• If so, opens a replacement job — auto-approved when within billing limit, otherwise a 'replace_approve' pending action.",
    "",
    "Press repeatedly to fast-forward the health decay until the replacement flow triggers.",
    "",
    "In production this runs nightly at 02:00 UTC (currently disabled).",
  ],
};

function HelpIcon({ help }: { help: { title: string; body: string[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border border-gold/60 text-gold text-[11px] cursor-help select-none bg-panel hover:bg-gold/10 font-bold leading-none"
        aria-label={`${help.title} help`}
      >
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute top-full right-0 mt-2 z-50 w-80 bg-panel2 border border-gold/40 p-3 text-[11px] text-text leading-relaxed shadow-xl"
        >
          <span className="block label-eyebrow text-gold mb-2">{help.title}</span>
          {help.body.map((line, i) =>
            line === "" ? (
              <span key={i} className="block h-2" />
            ) : (
              <span key={i} className="block text-textdim">
                {line}
              </span>
            )
          )}
        </span>
      )}
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
        <HelpIcon help={TICK_HELP} />
      </div>
      <div className="flex items-center">
        <button
          onClick={() => wrap("poll", () => fn.pollOrders())}
          disabled={busy !== null}
          className="px-3 py-1.5 border border-blue/40 text-blue hover:bg-blue/10 text-[10px] label-eyebrow disabled:opacity-30"
        >
          {busy === "poll" ? "POLLING…" : "POLL ORDERS"}
        </button>
        <HelpIcon help={POLL_HELP} />
      </div>
      {msg && <div className="text-textdim text-[10px] ml-2 truncate max-w-md">{msg}</div>}
    </div>
  );
}
