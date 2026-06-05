"use client";

import { useCallback, useEffect, useState } from "react";
import KPIRow from "@/components/KPIRow";
import KanbanBoard from "@/components/KanbanBoard";
import SyncLogFeed from "@/components/SyncLogFeed";
import { fetchLeads, fetchSyncLog } from "@/lib/queries";
import { LeadCard, SyncLogRow } from "@/lib/types";

export default function HomePage() {
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [syncLog, setSyncLog] = useState<SyncLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([fetchLeads(), fetchSyncLog(25)]);
      setLeads(l);
      setSyncLog(s);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000); // poll every 5s for real-time feel
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <main className="min-h-screen px-6 py-8 max-w-[1600px] mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">HubSpot Sync Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Move leads through the pipeline. Confirmed meetings auto-push to HubSpot.
        </p>
      </header>

      {err && (
        <div className="mb-6 px-4 py-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          <KPIRow leads={leads} syncLog={syncLog} />
          <div className="mt-8">
            <KanbanBoard leads={leads} onChange={refresh} />
          </div>
          <div className="mt-10">
            <SyncLogFeed rows={syncLog} />
          </div>
        </>
      )}
    </main>
  );
}
