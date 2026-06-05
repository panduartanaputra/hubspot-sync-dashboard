"use client";

import { SyncLogRow } from "@/lib/types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SyncLogFeed({ rows }: { rows: SyncLogRow[] }) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-3">Recent sync activity</h2>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500 italic">No sync activity yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">HubSpot IDs</th>
                <th className="text-left px-4 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-4 py-2 text-slate-400">{fmtTime(r.attempted_at)}</td>
                  <td className="px-4 py-2">{r.action}</td>
                  <td className="px-4 py-2">
                    <span className={
                      r.status === "success"
                        ? "text-emerald-300"
                        : r.status === "failure"
                        ? "text-red-300"
                        : "text-amber-300"
                    }>
                      {r.status}
                    </span>
                    {r.error_message && (
                      <div className="text-[11px] text-red-300/70 mt-0.5 truncate max-w-md" title={r.error_message}>
                        {r.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">
                    {r.hubspot_contact_id && <div>contact {r.hubspot_contact_id}</div>}
                    {r.hubspot_deal_id && <div>deal {r.hubspot_deal_id}</div>}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
