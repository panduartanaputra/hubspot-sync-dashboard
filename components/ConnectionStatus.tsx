"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActiveConnection, disconnectHubSpot, fetchPendingMirrorCount, purgeMirrorNow, HubSpotConnection } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import PipelineMapper from "@/components/PipelineMapper";
import ConnectSyncModal from "@/components/ConnectSyncModal";
import { droppedOptionalScopes, type SyncConfig } from "@/lib/hubspotScopes";

export default function ConnectionStatus() {
  const [conn, setConn] = useState<HubSpotConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashTone, setFlashTone] = useState<"info" | "error">("info");
  const [showPipeline, setShowPipeline] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [pendingMirror, setPendingMirror] = useState(0);
  // Inline confirmation instead of window.confirm(), which some browsers
  // (e.g. Comet) silently block — making Disconnect/Purge appear to do nothing.
  const [confirmKind, setConfirmKind] = useState<null | "disconnect" | "purge">(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  function showFlash(msg: string, tone: "info" | "error" = "info", ms = 5000) {
    setFlash(msg);
    setFlashTone(tone);
    setTimeout(() => setFlash(null), ms);
  }

  async function refresh() {
    try {
      setConn(await fetchActiveConnection());
      try { setPendingMirror(await fetchPendingMirrorCount()); } catch { /* non-fatal */ }
    } catch (e) {
      console.error("connection fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }

  async function doPurge() {
    setConfirmKind(null);
    setBusy(true);
    try {
      const n = await purgeMirrorNow();
      await refresh();
      showFlash(`Purged ${n} mirrored record${n === 1 ? "" : "s"}`, "info", 4000);
    } catch (e) {
      showFlash(e instanceof Error ? e.message : String(e), "error", 6000);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();

    // Show flash if the user landed here via callback fallback (non-popup path)
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("oauth") === "connected") {
        showFlash(`Connected to portal ${sp.get("portal")}`, "info");
        window.history.replaceState({}, "", window.location.pathname);
      }
      const err = sp.get("oauth_error");
      if (err) {
        showFlash(`OAuth error: ${err}`, "error", 8000);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    // Listen for postMessage from the OAuth popup
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "hubspot-oauth") return;
      if (data.oauth === "connected") {
        showFlash(`Connected to portal ${data.portal}`, "info");
        refresh();
      } else if (data.oauth_error) {
        showFlash(`OAuth error: ${data.oauth_error}`, "error", 8000);
      }
    }
    window.addEventListener("message", onMessage);

    // Realtime: subscribe to row changes on hubspot_connections so the UI flips
    // to ● CONNECTED the moment the OAuth callback writes the row, instead of
    // waiting for the 10s poll. Closes the window where users might re-click
    // Connect during the lag.
    const channel = supabase
      .channel("hubspot_connections_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hubspot_connections" },
        () => { refresh(); },
      )
      .subscribe();

    // Keep the 10s poll as a backstop (in case Realtime channel drops).
    const i = setInterval(refresh, 10000);
    return () => {
      clearInterval(i);
      window.removeEventListener("message", onMessage);
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  // Called from the consent modal's "Continue" click (still a user gesture, so
  // the popup isn't blocked). The chosen SyncConfig rides along as ?config=.
  function handleConnect(cfg: SyncConfig) {
    setShowConnectModal(false);

    const w = 600;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top  = window.screenY + (window.outerHeight - h) / 2;
    const features = `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)}`;

    // Unique window name on every click so the browser NEVER reuses a stale popup
    // from a previous attempt (which would re-fire its old postMessage on focus).
    const windowName = `hubspot-oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const connectUrl = `/api/hubspot/connect?config=${encodeURIComponent(JSON.stringify(cfg))}`;
    const popup = window.open(connectUrl, windowName, features);

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      showFlash(
        "Popup blocked. Please allow popups for this site and try again.",
        "error",
        8000,
      );
      return;
    }

    // Defensive backup: poll for popup close, in case postMessage was missed.
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (popup.closed) {
        if (pollRef.current) clearInterval(pollRef.current);
        refresh();
      }
    }, 800);
  }

  async function doDisconnect() {
    setConfirmKind(null);
    setBusy(true);
    try {
      await disconnectHubSpot();
      await refresh();
      showFlash("Disconnected from HubSpot", "info", 4000);
    } catch (e) {
      showFlash(e instanceof Error ? e.message : String(e), "error", 6000);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-textdim2 tracking-wider uppercase">…</div>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {conn ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5 border border-green/50 text-green">
              ● CONNECTED
            </span>
            <span className="font-serif text-[13px] text-texthi">
              Portal {conn.hubspot_portal_id}
            </span>
          </div>
          {conn.hubspot_user_email && (
            <div className="text-[10px] text-textdim tracking-wider">{conn.hubspot_user_email}</div>
          )}
          {conn.reauth_required && (
            <div className="mt-1 px-2 py-1 border border-red/50 text-red text-[10px] tracking-wider max-w-xs text-right">
              ⚠ Reconnect needed — HubSpot access expired.{" "}
              <button onClick={() => setShowConnectModal(true)} className="underline hover:text-texthi">Reconnect</button>
            </div>
          )}
          {(() => {
            const dropped = conn.sync_config && conn.granted_scopes
              ? droppedOptionalScopes(conn.sync_config, conn.granted_scopes) : [];
            return dropped.length > 0 ? (
              <div className="mt-1 text-[10px] text-gold/80 tracking-wider max-w-xs text-right">
                Some optional permissions weren’t granted ({dropped.length}). Those sync options are inactive.
              </div>
            ) : null;
          })()}
          <div className="flex items-center gap-1 mt-0.5">
            <button
              onClick={() => setShowPipeline((s) => !s)}
              className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2 hover:text-texthi"
            >
              {showPipeline ? "Hide pipeline" : "Pipeline ▸"}
            </button>
            {confirmKind === "disconnect" ? (
              <span className="flex items-center gap-1">
                <span className="text-[10px] text-textdim tracking-wider">Disconnect?</span>
                <button
                  onClick={doDisconnect}
                  disabled={busy}
                  className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-red/60 text-red hover:bg-red/10 disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmKind(null)}
                  className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2"
                >
                  No
                </button>
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
            <div className="w-[420px] mt-2 p-3 border border-border2 bg-panel/50">
              <PipelineMapper conn={conn} onSaved={refresh} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-textdim">HubSpot CRM</div>
          <button
            onClick={() => setShowConnectModal(true)}
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-gold text-gold hover:bg-gold/10 mt-1"
          >
            Connect HubSpot →
          </button>
          {pendingMirror > 0 && (
            <div className="mt-2 text-[10px] text-textdim tracking-wider max-w-xs text-right">
              {pendingMirror} mirrored record{pendingMirror === 1 ? "" : "s"} kept for 30 days after disconnect.{" "}
              {confirmKind === "purge" ? (
                <span>
                  Delete permanently?{" "}
                  <button onClick={doPurge} disabled={busy} className="underline text-red hover:text-red disabled:opacity-50">Yes</button>
                  {" · "}
                  <button onClick={() => setConfirmKind(null)} className="underline hover:text-texthi">No</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmKind("purge")}
                  disabled={busy}
                  className="underline hover:text-red disabled:opacity-50"
                >
                  Purge now
                </button>
              )}
            </div>
          )}
        </>
      )}
      {showConnectModal && (
        <ConnectSyncModal onContinue={handleConnect} onCancel={() => setShowConnectModal(false)} />
      )}
      {flash && (
        <div
          className={`text-[10px] tracking-wider mt-1 max-w-xs text-right ${
            flashTone === "error" ? "text-red" : "text-cyan"
          }`}
        >
          {flash}
        </div>
      )}
    </div>
  );
}
