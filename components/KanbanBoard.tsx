"use client";

import { useMemo, useState } from "react";
import { KANBAN_COLUMNS, KanbanColumn, LeadCard } from "@/lib/types";
import LeadCardView from "./LeadCard";
import BookMeetingModal from "./BookMeetingModal";

interface Props {
  leads: LeadCard[];
  onChange: () => void;
}

// Override KANBAN_COLUMNS tone styling for the cockpit theme
const COLUMN_ACCENTS: Record<KanbanColumn, string> = {
  interested:     "text-textdim2",
  qualified:      "text-blue",
  meeting_booked: "text-gold",
  meeting_held:   "text-green",
  closed:         "text-textdim",
};

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
      <div className="mb-3 label-eyebrow">PIPELINE</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-0 border border-border bg-panel">
        {KANBAN_COLUMNS.map((col, idx) => {
          const cards = byColumn.get(col.id) ?? [];
          const accent = COLUMN_ACCENTS[col.id];
          return (
            <div
              key={col.id}
              className={`px-3 py-3 min-h-[500px] ${idx > 0 ? "border-l border-border" : ""}`}
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <div className={`label-eyebrow ${accent}`}>{col.label.toUpperCase()}</div>
                <div className={`text-xs font-bold ${accent}`}>{cards.length.toString().padStart(2, "0")}</div>
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
                  <div className="text-[10px] text-textdim2 italic tracking-wider">— EMPTY —</div>
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
