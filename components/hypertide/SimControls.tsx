"use client";

import { useState } from "react";
import { SimulationConfig, fn } from "@/lib/hypertide";
import HelpIcon from "./HelpIcon";

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

const FINALIZE_HELP = {
  title: "FINALIZE CANCELLATIONS",
  body: [
    "Closes the 24h wind-down for every order in 'cancelling' status whose Stripe window has expired.",
    "",
    "For each finalised order:",
    "• Mailboxes are removed from Smartlead (per-order tracking)",
    "• Master inbox is disconnected from Unipile",
    "• Order status flips cancelling → cancelled",
    "",
    "In simulation this button forces finalization on every cancelling order regardless of the 24h timer so you can demo the path immediately.",
    "",
    "If Smartlead removal fails, a 'remove_from_smartlead' pending action is opened for retry; the order still transitions to cancelled.",
    "",
    "In production this runs hourly via cron (currently disabled).",
  ],
};

const WARMUP_HELP = {
  title: "CHECK WARMUP",
  body: [
    "Smartlead runs a fixed 14-day warm-up per mailbox, regardless of how many mailboxes a domain has.",
    "",
    "This button scans every mailbox under every domain and:",
    "• Marks any mailbox whose 14-day timer has elapsed as 'warmed up'",
    "• Rolls the result up to the WARMUP column on each domain row",
    "",
    "A domain is fully warmed up only when ALL of its mailboxes have completed (not just the master inbox).",
    "",
    "In production this runs hourly via cron (currently disabled).",
  ],
};

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
    <div>
      <div className="text-[10px] label-eyebrow-dim mb-3">
        MODE: <span className="text-gold">{sim?.mode ?? "?"}</span> · DRY-RUN:{" "}
        <span className="text-gold">{sim?.force_dry_run ? "ON" : "OFF"}</span>
      </div>
      <div className="grid grid-cols-[max-content_max-content] gap-3">
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
        <div className="flex items-center">
          <button
            onClick={() => wrap("finalize", () => fn.finalizeCancellations({ force: true }))}
            disabled={busy !== null}
            className="px-3 py-1.5 border border-red/40 text-red hover:bg-red/10 text-[10px] label-eyebrow disabled:opacity-30"
          >
            {busy === "finalize" ? "FINALIZING…" : "FINALIZE CANCELLATIONS"}
          </button>
          <HelpIcon help={FINALIZE_HELP} />
        </div>
        <div className="flex items-center">
          <button
            onClick={() => wrap("warmup", () => fn.checkWarmup())}
            disabled={busy !== null}
            className="px-3 py-1.5 border border-green/40 text-green hover:bg-green/10 text-[10px] label-eyebrow disabled:opacity-30"
          >
            {busy === "warmup" ? "CHECKING…" : "CHECK WARMUP"}
          </button>
          <HelpIcon help={WARMUP_HELP} />
        </div>
      </div>
      {msg && <div className="text-textdim text-[10px] mt-3 truncate max-w-md">{msg}</div>}
    </div>
  );
}
