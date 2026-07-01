"use client";

// Integrations side panel — right-hand slide-in, mirrors ATLAS METIS's
// "Settings › Integrations". This is the SINGLE place to connect/manage a CRM;
// the header only has the trigger (no duplicate Connect button).
//
// HubSpot is live: the row expands with connect / disconnect / pipeline mapping /
// purge / reauth. Every other connector is an honest "Coming soon" placeholder —
// the sync engine's adapter registry can plug them in later with no UI rework.

import { useState } from "react";
import PipelineMapper from "@/components/PipelineMapper";
import { droppedOptionalScopes } from "@/lib/hubspotScopes";
import type { HubSpotConnection } from "@/lib/queries";

interface Connector {
  key: string;
  name: string;
  blurb: string;
  glyph: string;
  tint: string;
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

export default function IntegrationsPanel({
  conn,
  pendingMirror,
  liveMirror,
  busy,
  onConnectHubSpot,
  onDisconnectHubSpot,
  onPurge,
  onPurgeConnection,
  onPipelineSaved,
  onClose,
}: {
  conn: HubSpotConnection | null;
  pendingMirror: number;
  liveMirror: number;
  busy: boolean;
  onConnectHubSpot: () => void;
  onDisconnectHubSpot: () => void;
  onPurge: () => void;
  onPurgeConnection: () => void;
  onPipelineSaved: () => void;
  onClose: () => void;
}) {
  const [showPipeline, setShowPipeline] = useState(false);
  const [confirmKind, setConfirmKind] = useState<null | "disconnect" | "purge" | "purge_live">(null);
  const dropped = conn?.sync_config && conn?.granted_scopes
    ? droppedOptionalScopes(conn.sync_config, conn.granted_scopes) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-[420px] max-w-[92vw] overflow-y-auto bg-panel border-l border-border2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-[13px] font-bold tracking-[0.15em] uppercase text-texthi">Integrations</div>
          <button onClick={onClose} className="text-[12px] text-textdim hover:text-texthi">✕</button>
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
              <div key={c.key} className="px-3 py-2.5 border border-border2 bg-panel2/30">
                <div className="flex items-center gap-3">
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
                    <div className="text-[10px] text-textdim tracking-wide">{c.blurb}</div>
                    {connected && conn && (
                      <div className="text-[10px] text-textdim2 tracking-wider">
                        Portal {conn.hubspot_portal_id}{conn.hubspot_user_email ? ` · ${conn.hubspot_user_email}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {c.status === "coming" ? (
                      <span className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-1 border border-border2 text-textdim2">
                        {c.comingLabel}
                      </span>
                    ) : connected ? null : (
                      <button
                        onClick={onConnectHubSpot}
                        className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-1 border border-gold text-gold hover:bg-gold/10"
                      >
                        Connect →
                      </button>
                    )}
                  </div>
                </div>

                {/* HubSpot management, inline in its row */}
                {connected && conn && (
                  <div className="mt-2 pt-2 border-t border-border2/60">
                    {conn.reauth_required && (
                      <div className="mb-2 px-2 py-1 border border-red/50 text-red text-[10px] tracking-wider">
                        ⚠ Reconnect needed — HubSpot access expired.{" "}
                        <button onClick={onConnectHubSpot} className="underline hover:text-texthi">Reconnect</button>
                      </div>
                    )}
                    {dropped.length > 0 && (
                      <div className="mb-2 text-[10px] text-gold/80 tracking-wider">
                        Some optional permissions weren’t granted ({dropped.length}). Those sync options are inactive.
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowPipeline((s) => !s)}
                        className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2 hover:text-texthi"
                      >
                        {showPipeline ? "Hide pipeline" : "Pipeline ▸"}
                      </button>
                      {confirmKind === "disconnect" ? (
                        <span className="flex items-center gap-1">
                          <span className="text-[10px] text-textdim tracking-wider">Disconnect?</span>
                          <button onClick={() => { setConfirmKind(null); onDisconnectHubSpot(); }} disabled={busy}
                            className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-red/60 text-red hover:bg-red/10 disabled:opacity-50">Yes</button>
                          <button onClick={() => setConfirmKind(null)}
                            className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2">No</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmKind("disconnect")}
                          disabled={busy}
                          className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2 hover:text-red disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                    {showPipeline && (
                      <div className="mt-2 p-3 border border-border2 bg-panel/50">
                        <PipelineMapper conn={conn} onSaved={onPipelineSaved} />
                      </div>
                    )}

                    {/* Data & retention — visible while connected so users always
                        know what's held and can erase it on demand (no 30-day wait). */}
                    <div className="mt-2 pt-2 border-t border-border2/60 text-[10px] text-textdim tracking-wider">
                      Metis is mirroring <span className="text-texthi">{liveMirror}</span> record{liveMirror === 1 ? "" : "s"} from HubSpot.
                      On disconnect they’re hidden instantly and deleted after 30 days.{" "}
                      {liveMirror > 0 && (
                        confirmKind === "purge_live" ? (
                          <span>
                            Delete now?{" "}
                            <button onClick={() => { setConfirmKind(null); onPurgeConnection(); }} disabled={busy} className="underline text-red hover:text-red disabled:opacity-50">Yes</button>
                            {" · "}
                            <button onClick={() => setConfirmKind(null)} className="underline hover:text-texthi">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmKind("purge_live")} disabled={busy} className="underline hover:text-red disabled:opacity-50">Purge now</button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Purge affordance (only when disconnected but mirror data still in grace) */}
                {isHubspot && !conn && pendingMirror > 0 && (
                  <div className="mt-2 pt-2 border-t border-border2/60 text-[10px] text-textdim tracking-wider">
                    {pendingMirror} mirrored record{pendingMirror === 1 ? "" : "s"} kept for 30 days after disconnect.{" "}
                    {confirmKind === "purge" ? (
                      <span>
                        Delete permanently?{" "}
                        <button onClick={() => { setConfirmKind(null); onPurge(); }} disabled={busy} className="underline text-red hover:text-red disabled:opacity-50">Yes</button>
                        {" · "}
                        <button onClick={() => setConfirmKind(null)} className="underline hover:text-texthi">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmKind("purge")} disabled={busy} className="underline hover:text-red disabled:opacity-50">Purge now</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
