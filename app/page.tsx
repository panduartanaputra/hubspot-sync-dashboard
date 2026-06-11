"use client";

import { useCallback, useEffect, useState } from "react";
import KPIRow from "@/components/KPIRow";
import KanbanBoard from "@/components/KanbanBoard";
import SyncLogFeed from "@/components/SyncLogFeed";
import ConnectionStatus from "@/components/ConnectionStatus";
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
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <main className="min-h-screen px-8 py-7 max-w-[1600px] mx-auto">
      {/* Header bar — cockpit topbar */}
      <header className="flex items-end justify-between mb-8 pb-5 border-b border-border">
        <div>
          <div className="label-eyebrow mb-1.5">METIS · LEAD HANDOFF</div>
          <h1 className="font-serif text-[26px] font-bold text-texthi leading-none">HubSpot Sync Cockpit</h1>
          <p className="text-xs text-textdim mt-2">
            Move leads through the funnel. Confirmed meetings auto-push to HubSpot.
          </p>
        </div>
        <ConnectionStatus />
      </header>

      {err && (
        <div className="mb-6 px-4 py-3 border border-red/40 bg-red/5 text-red text-xs">
          <span className="label-eyebrow text-red mr-2">ERROR</span>{err}
        </div>
      )}

      {loading ? (
        <div className="text-textdim text-xs label-eyebrow-dim">LOADING…</div>
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
