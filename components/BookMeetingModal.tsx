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
  // 3 days from now, rounded to next hour, as `YYYY-MM-DDTHH:MM` for <input type="datetime-local">
  const d = new Date(Date.now() + 3 * 86400000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BookMeetingModal({ lead, onClose, onSaved }: Props) {
  const [when, setWhen] = useState(defaultDateTime());
  const [link, setLink] = useState("https://meet.google.com/sim-" + Math.random().toString(36).slice(2, 12));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5"
      >
        <h2 className="text-lg font-semibold">Book a meeting</h2>
        <p className="text-sm text-slate-400 mt-1">
          {lead.organization.name} · {lead.primaryPerson?.full_name ?? "—"}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Scheduled at</div>
            <input
              type="datetime-local"
              value={when}
              onChange={e => setWhen(e.target.value)}
              required
              className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Meeting link</div>
            <input
              type="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Agenda</div>
            <textarea
              value={agenda}
              onChange={e => setAgenda(e.target.value)}
              rows={3}
              className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
            />
          </label>
        </div>

        {err && (
          <div className="mt-3 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-red-200 text-xs">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--panel-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 text-sm rounded-md bg-violet-500/30 border border-violet-500/60 text-violet-100 hover:bg-violet-500/40 disabled:opacity-50"
          >
            {saving ? "Booking…" : "Book + push to HubSpot"}
          </button>
        </div>
      </form>
    </div>
  );
}
