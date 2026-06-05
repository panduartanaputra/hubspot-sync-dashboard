"use client";

import { useState } from "react";
import { bookMeeting } from "@/lib/queries";
import { LeadCard } from "@/lib/types";

interface Props {
  lead: LeadCard;
  onClose: () => void;
  onSaved: () => void;
}

function defaultDateTime(): string {
  const d = new Date(Date.now() + 3 * 86400000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BookMeetingModal({ lead, onClose, onSaved }: Props) {
  const [when, setWhen]   = useState(defaultDateTime());
  const [link, setLink]   = useState("https://meet.google.com/sim-" + Math.random().toString(36).slice(2, 12));
  const [agenda, setAgenda] = useState("Discovery call — pain mapping, scope, success criteria");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await bookMeeting({
        opportunityId: lead.opportunity.id,
        primaryPersonId: lead.primaryPerson?.id ?? null,
        scheduledAt: new Date(when).toISOString(),
        meetingLink: link,
        agenda,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg border border-border2 bg-panel"
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="label-eyebrow">BOOK MEETING</div>
          <button type="button" onClick={onClose} className="text-textdim hover:text-text text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4">
          <div className="font-serif text-[20px] font-bold text-texthi leading-tight">{lead.organization.name}</div>
          <div className="text-[12px] text-gold mt-0.5">{lead.primaryPerson?.full_name ?? "—"}</div>
          <div className="text-[10px] text-textdim mt-0.5 tracking-wider uppercase">{lead.primaryPerson?.title ?? "—"}</div>

          <div className="mt-5 space-y-3">
            <label className="block">
              <div className="label-eyebrow-dim mb-1.5">SCHEDULED AT</div>
              <input
                type="datetime-local"
                value={when}
                onChange={e => setWhen(e.target.value)}
                required
                className="w-full bg-bg border border-border px-3 py-2 text-[13px] text-text focus:outline-none focus:border-gold/60"
              />
            </label>
            <label className="block">
              <div className="label-eyebrow-dim mb-1.5">MEETING LINK</div>
              <input
                type="url"
                value={link}
                onChange={e => setLink(e.target.value)}
                className="w-full bg-bg border border-border px-3 py-2 text-[12px] text-text focus:outline-none focus:border-gold/60"
              />
            </label>
            <label className="block">
              <div className="label-eyebrow-dim mb-1.5">AGENDA</div>
              <textarea
                value={agenda}
                onChange={e => setAgenda(e.target.value)}
                rows={3}
                className="w-full bg-bg border border-border px-3 py-2 text-[12px] text-text focus:outline-none focus:border-gold/60"
              />
            </label>
          </div>

          {err && (
            <div className="mt-3 px-3 py-2 border border-red/40 bg-red/5 text-red text-[11px]">
              <span className="label-eyebrow text-red mr-2">ERROR</span>{err}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-2 border border-border2 text-textdim hover:bg-panel2 hover:text-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-2 border border-gold text-gold hover:bg-gold/10 disabled:opacity-50"
          >
            {saving ? "Booking…" : "Book + Push To HubSpot"}
          </button>
        </div>
      </form>
    </div>
  );
}
