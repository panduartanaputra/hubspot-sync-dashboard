"use client";

import { useMemo, useState } from "react";
import { KANBAN_COLUMNS, KanbanColumn, LeadCard } from "@/lib/types";
import LeadCardView from "./LeadCard";
import BookMeetingModal from "./BookMeetingModal";

interface Props {
  leads: LeadCard[];
  onChange: () => void;
}

export default function KanbanBoard({ leads, onChange }: Props) {
  const [bookingFor, setBookingFor] = useState<LeadCard | null>(null);

  const byColumn = useMemo(() => {
    const m = new Map<KanbanColumn, LeadCard[]>();
    KANBAN_COLUMNS.forEach(c => m.set(c.id, []));
    for (const lead of leads) m.get(lead.column)!.push(lead);
    return m;
  }, [leads]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {KANBAN_COLUMNS.map(col => {
          const cards = byColumn.get(col.id) ?? [];
          return (
            <div key={col.id} className={`rounded-lg border ${col.tone} px-3 py-3 min-h-[500px]`}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wider text-slate-300 font-medium">{col.label}</div>
                <div className="text-xs text-slate-400">{cards.length}</div>
              </div>
              <div className="space-y-2">
                {cards.map(lead => (
                  <LeadCardView
                    key={lead.opportunity.id}
                    lead={lead}
                    onRequestBookMeeting={() => setBookingFor(lead)}
                    onChange={onChange}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="text-[11px] text-slate-500 italic">No leads here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {bookingFor && (
        <BookMeetingModal
          lead={bookingFor}
          onClose={() => setBookingFor(null)}
          onSaved={() => { setBookingFor(null); onChange(); }}
        />
      )}
    </>
  );
}
