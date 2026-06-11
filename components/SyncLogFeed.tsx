"use client";

import { SyncLogRow } from "@/lib/types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SyncLogFeed({ rows }: { rows: SyncLogRow[] }) {
  return (
    <section>
      <div className="label-eyebrow mb-3">SYNC ACTIVITY · LAST {rows.length}</div>
      <div className="border border-border bg-panel">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-xs text-textdim2 italic tracking-wider uppercase">— No sync activity yet —</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="label-eyebrow-dim">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 font-bold">TIME</th>
                <th className="text-left px-4 py-2.5 font-bold">DIRECTION</th>
                <th className="text-left px-4 py-2.5 font-bold">ACTION</th>
                <th className="text-left px-4 py-2.5 font-bold">STATUS</th>
                <th className="text-left px-4 py-2.5 font-bold">HUBSPOT IDS</th>
                <th className="text-left px-4 py-2.5 font-bold">DURATION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const inbound = r.destination === "hubspot_inbound";
                return (
                <tr key={r.id} className={`border-b border-border/60 last:border-0 hover:bg-panel2 ${inbound ? "bg-cyan/[0.03]" : ""}`}>
                  <td className="px-4 py-2 text-textdim font-mono">{fmtTime(r.attempted_at)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border ${
                      inbound ? "border-cyan/50 text-cyan" : "border-gold/50 text-gold"
                    }`}>
                      {inbound ? "← IN" : "→ OUT"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text uppercase tracking-wider text-[11px]">{r.action.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border ${
                      r.status === "success"
                        ? "border-green/50 text-green"
                        : r.status === "failure"
                        ? "border-red/50 text-red"
                        : "border-gold/50 text-gold"
                    }`}>
                      {r.status}
                    </span>
                    {r.error_message && (
                      <div className="text-[10px] text-red/70 mt-1 truncate max-w-md" title={r.error_message}>
                        {r.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-textdim text-[10px] font-mono">
                    {r.hubspot_contact_id && <div>C · {r.hubspot_contact_id}</div>}
                    {r.hubspot_deal_id && <div>D · {r.hubspot_deal_id}</div>}
                  </td>
                  <td className="px-4 py-2 text-textdim font-mono">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
