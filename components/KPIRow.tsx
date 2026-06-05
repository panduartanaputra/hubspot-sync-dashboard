"use client";

import { LeadCard, SyncLogRow } from "@/lib/types";

function startOfThisWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday-start week
  return new Date(d.setHours(0, 0, 0, 0) + (diff - d.getDate()) * 86400000);
}

interface Props {
  leads: LeadCard[];
  syncLog: SyncLogRow[];
}

export default function KPIRow({ leads, syncLog }: Props) {
  const total = leads.length;

  // Meetings counted by latest meeting status
  const booked = leads.filter(l => l.latestMeeting?.status === "booked").length;
  const held   = leads.filter(l => l.latestMeeting?.status === "held").length;
  const noShow = leads.filter(l => l.latestMeeting?.status === "no_show").length;

  // Booked this week
  const weekStart = startOfThisWeek();
  const bookedThisWeek = leads.filter(l => {
    const m = l.latestMeeting;
    return m && m.status === "booked" && new Date(m.scheduled_at) >= weekStart;
  }).length;

  // Show rate = held / (held + no_show)
  const showRateDenom = held + noShow;
  const showRate = showRateDenom > 0 ? Math.round((held / showRateDenom) * 100) : null;

  // Sync success rate (last 50 sync_log rows)
  const recent = syncLog.slice(0, 50);
  const okCount = recent.filter(r => r.status === "success").length;
  const syncRate = recent.length > 0 ? Math.round((okCount / recent.length) * 100) : null;

  // Pipeline $ value (open opportunities)
  const pipelineUsd = leads
    .filter(l => !["disqualified", "closed_won", "closed_lost"].includes(l.opportunity.status))
    .reduce((sum, l) => sum + Number(l.opportunity.value_usd ?? 0), 0);

  const cards: { label: string; value: string; sublabel?: string }[] = [
    { label: "Total leads",       value: total.toString() },
    { label: "Booked this week",  value: bookedThisWeek.toString(), sublabel: `${booked} booked total` },
    { label: "Show rate",         value: showRate == null ? "—" : `${showRate}%`, sublabel: `${held} held / ${noShow} no-show` },
    { label: "No-show rate",      value: showRateDenom > 0 ? `${Math.round((noShow / showRateDenom) * 100)}%` : "—" },
    { label: "Sync success",      value: syncRate == null ? "—" : `${syncRate}%`, sublabel: `${okCount}/${recent.length} recent` },
    { label: "Open pipeline",     value: `$${(pipelineUsd / 1000).toFixed(1)}k` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <div key={c.label} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{c.label}</div>
          <div className="text-2xl font-semibold mt-1">{c.value}</div>
          {c.sublabel && <div className="text-[11px] text-slate-500 mt-0.5">{c.sublabel}</div>}
        </div>
      ))}
    </div>
  );
}
