"use client";

// Phase 3 — pre-OAuth consent screen. The user picks what Metis pushes into
// their HubSpot and what it pulls back. Selection becomes a SyncConfig that the
// /connect route turns into dynamic scope + optional_scope params.
//
// The three core push objects (contacts, deals, meetings) are locked on — they
// are what the product does. Everything else is opt-in. Pull is entirely
// additive: pulled data mirrors into Metis, never overwriting native records.

import { useState, type ReactNode } from "react";
import { defaultSyncConfig, type SyncConfig } from "@/lib/hubspotScopes";

interface Row {
  key: string;
  label: string;
  hint: ReactNode;
  locked?: boolean;
}

// Highlights the exact HubSpot object/page the data lands in, so the user knows
// e.g. ticking "Companies" writes to their HubSpot Companies.
function Dest({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-texthi">{children}</strong>;
}

const PUSH_ROWS: Row[] = [
  { key: "contacts", label: "Contacts", hint: <>Leads Metis works appear in your HubSpot <Dest>Contacts</Dest></>, locked: true },
  { key: "deals", label: "Deals", hint: <>Opportunities appear as <Dest>Deals</Dest>, with pipeline stages</>, locked: true },
  { key: "meetings", label: "Meetings", hint: <>Booked meetings logged as <Dest>Meetings</Dest> on the timeline</>, locked: true },
  { key: "companies", label: "Companies", hint: <>Enriched records pushed to your HubSpot <Dest>Companies</Dest></> },
  { key: "notes", label: "Notes", hint: <>Agent findings written as <Dest>Notes</Dest> on the contact &amp; deal</> },
  { key: "tasks", label: "Tasks", hint: <>Follow-ups created as <Dest>Tasks</Dest> for your reps</> },
];

const PULL_ROWS: Row[] = [
  { key: "contacts", label: "Contacts", hint: <>Mirror your HubSpot <Dest>Contacts</Dest> (fields reps maintain)</> },
  { key: "companies", label: "Companies", hint: <>Mirror your HubSpot <Dest>Companies</Dest> (firmographics)</> },
  { key: "deals", label: "Deals", hint: <>Mirror your HubSpot <Dest>Deals</Dest> — stage changes reps make</> },
  { key: "owners", label: "Owners", hint: <>Mirror <Dest>Owners</Dest> — who owns which record</> },
  { key: "line_items", label: "Line items", hint: <>Mirror <Dest>Line items</Dest> on your deals</> },
];

export default function ConnectSyncModal({
  onContinue,
  onCancel,
}: {
  onContinue: (cfg: SyncConfig) => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<SyncConfig>(defaultSyncConfig());

  function togglePush(key: keyof SyncConfig["push"]) {
    setCfg((c) => ({ ...c, push: { ...c.push, [key]: !c.push[key] } }));
  }
  function togglePull(key: keyof SyncConfig["pull"]) {
    setCfg((c) => ({ ...c, pull: { ...c.pull, [key]: !c.pull[key] } }));
  }

  function Checkbox({ checked, locked }: { checked: boolean; locked?: boolean }) {
    return (
      <span
        className={`inline-flex items-center justify-center w-4 h-4 border text-[10px] font-bold ${
          checked ? "border-gold text-gold bg-gold/10" : "border-border2 text-transparent"
        } ${locked ? "opacity-60" : ""}`}
      >
        ✓
      </span>
    );
  }

  function Section({
    title,
    subtitle,
    rows,
    values,
    onToggle,
  }: {
    title: string;
    subtitle: string;
    rows: Row[];
    values: Record<string, boolean>;
    onToggle: (key: string) => void;
  }) {
    return (
      <div className="flex-1">
        <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-texthi">{title}</div>
        <div className="text-[10px] text-textdim tracking-wider mb-2">{subtitle}</div>
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={r.locked}
              onClick={() => !r.locked && onToggle(r.key)}
              className={`flex items-start gap-2 text-left px-2 py-1.5 border ${
                values[r.key] ? "border-border2 bg-panel2/40" : "border-border2/50"
              } ${r.locked ? "cursor-default" : "hover:bg-panel2"}`}
            >
              <Checkbox checked={values[r.key]} locked={r.locked} />
              <span className="flex flex-col">
                <span className="text-[12px] text-texthi flex items-center gap-1.5">
                  {r.label}
                  {r.locked && (
                    <span className="text-[8px] tracking-[0.15em] uppercase text-textdim2 border border-border2/60 px-1">
                      always
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-textdim tracking-wide">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div
        className="w-[640px] max-w-[92vw] max-h-[88vh] overflow-y-auto bg-panel border border-border2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-bold tracking-[0.15em] uppercase text-gold">Connect HubSpot</div>
        <div className="text-[11px] text-textdim tracking-wider mt-1 mb-4">
          Choose what syncs. Metis never overwrites your existing HubSpot fields — data from Metis is
          written to clearly-labeled properties, and anything pulled in is mirrored, not moved.
        </div>

        <div className="flex gap-6">
          <Section
            title="Push into HubSpot"
            subtitle="What Metis writes to your CRM"
            rows={PUSH_ROWS}
            values={cfg.push as unknown as Record<string, boolean>}
            onToggle={(k) => togglePush(k as keyof SyncConfig["push"])}
          />
          <Section
            title="Pull from HubSpot"
            subtitle="What Metis mirrors back in"
            rows={PULL_ROWS}
            values={cfg.pull as unknown as Record<string, boolean>}
            onToggle={(k) => togglePull(k as keyof SyncConfig["pull"])}
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-border2 text-textdim hover:bg-panel2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onContinue(cfg)}
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-gold text-gold hover:bg-gold/10"
          >
            Continue to HubSpot →
          </button>
        </div>
      </div>
    </div>
  );
}
