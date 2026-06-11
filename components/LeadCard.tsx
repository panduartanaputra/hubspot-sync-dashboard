"use client";

import { useState } from "react";
import { LeadCard as LeadCardType } from "@/lib/types";
import { disqualifyOpportunity, updateMeetingStatus } from "@/lib/queries";

interface Props {
  lead: LeadCardType;
  onRequestBookMeeting: () => void;
  onChange: () => void;
}

// Cockpit-style flat button: 1px border, tight letter-spacing, color-coded text.
function CockpitButton({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  tone: "gold" | "green" | "red" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "gold"  ? "border-gold/50 text-gold hover:bg-gold/10"
    : tone === "green" ? "border-green/50 text-green hover:bg-green/10"
    : tone === "red"   ? "border-red/50 text-red hover:bg-red/10"
    :                    "border-border2 text-textdim hover:bg-panel2 hover:text-text";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-1 border ${toneClass} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export default function LeadCardView({ lead, onRequestBookMeeting, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const { opportunity, organization, primaryPerson, latestMeeting, column } = lead;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onChange(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const pushed = !!opportunity.hubspot_deal_id;

  return (
    <div className="border border-border bg-panel2 px-3 py-2.5 hover:border-border2 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[15px] font-bold text-texthi truncate leading-tight">{organization.name}</div>
          <div className="text-[11px] text-gold mt-0.5 truncate">
            {primaryPerson?.full_name ?? "—"}
          </div>
          <div className="text-[10px] text-textdim mt-0.5 truncate tracking-wider uppercase">
            {primaryPerson?.title ?? "—"}
          </div>
        </div>
        {pushed && (
          <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border border-cyan/40 text-cyan whitespace-nowrap">
            HUBSPOT
          </span>
        )}
      </div>

      {latestMeeting && (
        <div className="text-[10px] text-textdim mt-2 tracking-wider uppercase">
          <span className={
            column === "meeting_booked" ? "text-gold"
            : column === "meeting_held" ? "text-green"
            : "text-textdim"
          }>
            {column === "meeting_booked" ? "▲ MEETING " : column === "meeting_held" ? "✓ HELD " : "✗ "}
          </span>
          {new Date(latestMeeting.scheduled_at).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {(column === "interested" || column === "qualified") && (
          <>
            <CockpitButton tone="gold" disabled={busy} onClick={onRequestBookMeeting}>
              Book
            </CockpitButton>
            <CockpitButton
              tone="neutral" disabled={busy}
              onClick={() => act(() => disqualifyOpportunity(opportunity.id, "Disqualified via dashboard"))}
            >
              Disqualify
            </CockpitButton>
          </>
        )}

        {column === "meeting_booked" && latestMeeting && (
          <>
            <CockpitButton tone="green" disabled={busy} onClick={() => act(() => updateMeetingStatus(latestMeeting.id, "held"))}>
              Mark Held
            </CockpitButton>
            <CockpitButton tone="red" disabled={busy} onClick={() => act(() => updateMeetingStatus(latestMeeting.id, "no_show"))}>
              No-Show
            </CockpitButton>
            <CockpitButton tone="neutral" disabled={busy} onClick={() => act(() => updateMeetingStatus(latestMeeting.id, "cancelled"))}>
              Cancel
            </CockpitButton>
          </>
        )}

        {column === "meeting_held" && (
          <span className="text-[10px] text-textdim2 italic tracking-wider uppercase">Pending close · client-side</span>
        )}

        {column === "closed" && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-textdim2 tracking-wider uppercase">{opportunity.status.replace("_", " ")}</span>
            {opportunity.closed_lost_reason && (
              <span className="text-[10px] text-red tracking-wider uppercase">
                ◉ {opportunity.closed_lost_reason}
              </span>
            )}
            {opportunity.last_change_source === "hubspot_inbound" && (
              <span className="text-[9px] text-cyan tracking-[0.15em] uppercase mt-0.5">
                ← Via HubSpot
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
