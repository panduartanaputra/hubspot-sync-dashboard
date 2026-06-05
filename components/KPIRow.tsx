"use client";

import { LeadCard, SyncLogRow } from "@/lib/types";

function startOfThisWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setHours(0, 0, 0, 0) + (diff - d.getDate()) * 86400000);
}

interface Props {
  leads: LeadCard[];
  syncLog: SyncLogRow[];
}

export default function KPIRow({ leads, syncLog }: Props) {
  const total  = leads.length;
  const booked = leads.filter(l => l.latestMeeting?.status === "booked").length;
  const held   = leads.filter(l => l.latestMeeting?.status === "held").length;
  const noShow = leads.filter(l => l.latestMeeting?.status === "no_show").length;

  const weekStart = startOfThisWeek();
  const bookedThisWeek = leads.filter(l => {
    const m = l.latestMeeting;
    return m && m.status === "booked" && new Date(m.scheduled_at) >= weekStart;
  }).length;

  const showRateDenom = held + noShow;
  const showRate = showRateDenom > 0 ? Math.round((held / showRateDenom) * 100) : null;

  const recent = syncLog.slice(0, 50);
  const okCount = recent.filter(r => r.status === "success").length;
  const syncRate = recent.length > 0 ? Math.round((okCount / recent.length) * 100) : null;

  const pipelineUsd = leads
    .filter(l => !["disqualified", "closed_won", "closed_lost"].includes(l.opportunity.status))
    .reduce((sum, l) => sum + Number(l.opportunity.value_usd ?? 0), 0);

  const cards: { label: string; value: string; sublabel?: string; tone?: string }[] = [
    { label: "TOTAL LEADS",       value: total.toString() },
    { label: "BOOKED · WTD",      value: bookedThisWeek.toString(), sublabel: `${booked} booked total`, tone: "gold" },
    { label: "SHOW RATE",         value: showRate == null ? "—" : `${showRate}%`, sublabel: `${held} held / ${noShow} no-show`, tone: "green" },
    { label: "NO-SHOW",           value: showRateDenom > 0 ? `${Math.round((noShow / showRateDenom) * 100)}%` : "—", tone: "red" },
    { label: "SYNC SUCCESS",      value: syncRate == null ? "—" : `${syncRate}%`, sublabel: `${okCount}/${recent.length} recent`, tone: "cyan" },
    { label: "OPEN PIPELINE",     value: `$${(pipelineUsd / 1000).toFixed(1)}k` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0 border border-border bg-panel">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className={`px-4 py-3 ${i > 0 ? "border-l border-border" : ""}`}
        >
          <div className="label-eyebrow-dim">{c.label}</div>
          <div
            className={`font-serif text-[28px] font-bold leading-none mt-2 ${
              c.tone === "gold" ? "text-gold"
              : c.tone === "green" ? "text-green"
              : c.tone === "red" ? "text-red"
              : c.tone === "cyan" ? "text-cyan"
              : "text-texthi"
            }`}
          >
            {c.value}
          </div>
          {c.sublabel && <div className="text-[10px] text-textdim mt-1.5 tracking-wider">{c.sublabel.toUpperCase()}</div>}
        </div>
      ))}
    </div>
  );
}
