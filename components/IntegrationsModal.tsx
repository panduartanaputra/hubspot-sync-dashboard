"use client";

// Integrations panel — mirrors the ATLAS METIS "Settings › Integrations" list.
// HubSpot is live (delegates connect/disconnect back to ConnectionStatus, the
// single source of truth for HubSpot state). Every other connector is an honest
// "Coming soon" placeholder — the sync engine's adapter registry can plug them
// in later without UI rework.

import type { HubSpotConnection } from "@/lib/queries";

interface Connector {
  key: string;
  name: string;
  blurb: string;
  glyph: string;   // simple text/emoji mark — no external assets (CSP-safe)
  tint: string;    // tailwind text color class for the mark
  status: "live" | "coming";
  comingLabel?: string;
}

const CONNECTORS: Connector[] = [
  { key: "hubspot", name: "HubSpot", blurb: "Sync prospects + activity to your HubSpot pipeline.", glyph: "H", tint: "text-[#FF7A59]", status: "live" },
  { key: "pipedrive", name: "Pipedrive", blurb: "Push prospects + touchpoints to your Pipedrive deals.", glyph: "P", tint: "text-green", status: "coming", comingLabel: "COMING AUGUST 2026" },
  { key: "salesforce", name: "Salesforce", blurb: "Sync prospects + activity to your Salesforce workspace.", glyph: "S", tint: "text-cyan", status: "coming", comingLabel: "COMING SOON" },
  { key: "zapier", name: "Zapier", blurb: "Trigger workflows from METIS signals and activity.", glyph: "Z", tint: "text-gold", status: "coming", comingLabel: "COMING AUGUST 2026" },
  { key: "slack", name: "Slack", blurb: "Send METIS alerts and updates into Slack channels.", glyph: "#", tint: "text-[#E01E5A]", status: "coming", comingLabel: "COMING AUGUST 2026" },
  { key: "teams", name: "Microsoft Teams", blurb: "Send METIS alerts and updates into Teams channels.", glyph: "T", tint: "text-[#6264A7]", status: "coming", comingLabel: "COMING AUGUST 2026" },
];

export default function IntegrationsModal({
  conn,
  onConnectHubSpot,
  onDisconnectHubSpot,
  onClose,
}: {
  conn: HubSpotConnection | null;
  onConnectHubSpot: () => void;
  onDisconnectHubSpot: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[560px] max-w-[92vw] max-h-[88vh] overflow-y-auto bg-panel border border-border2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-[13px] font-bold tracking-[0.15em] uppercase text-texthi">Integrations</div>
          <button onClick={onClose} className="text-[11px] text-textdim hover:text-texthi">✕</button>
        </div>
        <div className="text-[11px] text-textdim tracking-wider mb-4">
          Connect a CRM or channel. Metis never overwrites your existing data — pushes go to labeled
          fields, and anything pulled in is mirrored.
        </div>

        <div className="flex flex-col gap-2">
          {CONNECTORS.map((c) => {
            const isHubspot = c.key === "hubspot";
            const connected = isHubspot && !!conn;
            return (
              <div key={c.key} className="flex items-center gap-3 px-3 py-2.5 border border-border2 bg-panel2/30">
                <span className={`flex items-center justify-center w-8 h-8 border border-border2 font-bold ${c.tint}`}>
                  {c.glyph}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-texthi flex items-center gap-2">
                    {c.name}
                    {connected && (
                      <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-1 py-0.5 border border-green/50 text-green">
                        ● CONNECTED
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-textdim tracking-wide truncate">{c.blurb}</div>
                  {connected && conn?.hubspot_portal_id && (
                    <div className="text-[10px] text-textdim2 tracking-wider">Portal {conn.hubspot_portal_id}</div>
                  )}
                </div>
                <div className="shrink-0">
                  {c.status === "coming" ? (
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-1 border border-border2 text-textdim2">
                      {c.comingLabel}
                    </span>
                  ) : connected ? (
                    <button
                      onClick={onDisconnectHubSpot}
                      className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-1 border border-border2 text-textdim hover:bg-panel2 hover:text-red"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={onConnectHubSpot}
                      className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-1 border border-gold text-gold hover:bg-gold/10"
                    >
                      Connect →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
