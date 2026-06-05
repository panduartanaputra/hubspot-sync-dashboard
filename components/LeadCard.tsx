"use client";

import { useState } from "react";
import { LeadCard as LeadCardType } from "@/lib/types";
import { disqualifyOpportunity, updateMeetingStatus } from "@/lib/queries";

interface Props {
  lead: LeadCardType;
  onRequestBookMeeting: () => void;
  onChange: () => void;
}

export default function LeadCardView({ lead, onRequestBookMeeting, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const { opportunity, organization, primaryPerson, latestMeeting, column } = lead;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onChange(); }
    catch (e) { alert((e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  }

  const pushed = !!opportunity.hubspot_deal_id;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100 truncate">{organization.name}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {primaryPerson?.full_name ?? "—"} · {primaryPerson?.title ?? "—"}
          </div>
        </div>
        {pushed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 whitespace-nowrap">
            HubSpot ✓
          </span>
        )}
      </div>

      {latestMeeting && (
        <div className="text-[11px] text-slate-400 mt-1.5">
          {column === "meeting_booked" && "📅 "}
          {column === "meeting_held" && "✓ "}
          {new Date(latestMeeting.scheduled_at).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-2">
        {column === "interested" || column === "qualified" ? (
          <>
            <button
              onClick={onRequestBookMeeting}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-violet-500/20 border border-violet-500/40 text-violet-200 hover:bg-violet-500/30 disabled:opacity-50"
            >
              Book meeting
            </button>
            <button
              onClick={() => act(() => disqualifyOpportunity(opportunity.id, "Disqualified via dashboard"))}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-zinc-500/15 border border-zinc-500/40 text-slate-300 hover:bg-zinc-500/25 disabled:opacity-50"
            >
              Disqualify
            </button>
          </>
        ) : null}

        {column === "meeting_booked" && latestMeeting && (
          <>
            <button
              onClick={() => act(() => updateMeetingStatus(latestMeeting.id, "held"))}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              Mark held
            </button>
            <button
              onClick={() => act(() => updateMeetingStatus(latestMeeting.id, "no_show"))}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-red-500/15 border border-red-500/40 text-red-200 hover:bg-red-500/25 disabled:opacity-50"
            >
              No-show
            </button>
            <button
              onClick={() => act(() => updateMeetingStatus(latestMeeting.id, "cancelled"))}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-zinc-500/15 border border-zinc-500/40 text-slate-300 hover:bg-zinc-500/25 disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}

        {column === "meeting_held" && (
          <span className="text-[11px] text-slate-400 italic">Pending close · client-side</span>
        )}

        {column === "closed" && (
          <span className="text-[11px] text-slate-500">{opportunity.status}</span>
        )}
      </div>
    </div>
  );
}
