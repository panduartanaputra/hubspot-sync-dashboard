"use client";

import { useState } from "react";
import { SimulationConfig, fn } from "@/lib/hypertide";

interface Props {
  sim: SimulationConfig | null;
  onChange: () => void;
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
      <button
        onClick={() => wrap("tick", () => fn.tick())}
        disabled={busy !== null}
        className="px-3 py-1.5 border border-cyan/40 text-cyan hover:bg-cyan/10 text-[10px] label-eyebrow disabled:opacity-30"
      >
        {busy === "tick" ? "TICKING…" : "TICK SIMULATION"}
      </button>
      <button
        onClick={() => wrap("poll", () => fn.pollOrders())}
        disabled={busy !== null}
        className="px-3 py-1.5 border border-blue/40 text-blue hover:bg-blue/10 text-[10px] label-eyebrow disabled:opacity-30"
      >
        {busy === "poll" ? "POLLING…" : "POLL ORDERS"}
      </button>
      {msg && <div className="text-textdim text-[10px] ml-2 truncate max-w-md">{msg}</div>}
    </div>
  );
}
