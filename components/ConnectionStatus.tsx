"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActiveConnection, disconnectHubSpot, fetchPendingMirrorCount, purgeMirrorNow, HubSpotConnection } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import ConnectSyncModal from "@/components/ConnectSyncModal";
import IntegrationsPanel from "@/components/IntegrationsPanel";
import type { SyncConfig } from "@/lib/hubspotScopes";

// Header widget: just a trigger for the Integrations side panel + a compact
// status line. All connect/disconnect/manage controls live inside the panel
// (single source of truth) — no duplicate Connect button in the header.
export default function ConnectionStatus() {
  const [conn, setConn] = useState<HubSpotConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashTone, setFlashTone] = useState<"info" | "error">("info");
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [pendingMirror, setPendingMirror] = useState(0);
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

  async function doDisconnect() {
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

  async function doPurge() {
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

    const channel = supabase
      .channel("hubspot_connections_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hubspot_connections" },
        () => { refresh(); },
      )
      .subscribe();

    const i = setInterval(refresh, 10000);
    return () => {
      clearInterval(i);
      window.removeEventListener("message", onMessage);
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  // Opened from the panel's Connect/Reconnect button (a user gesture, so the
  // popup isn't blocked). The chosen SyncConfig rides along as ?config=.
  function handleConnect(cfg: SyncConfig) {
    setShowConnectModal(false);

    const w = 600;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top  = window.screenY + (window.outerHeight - h) / 2;
    const features = `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)}`;

    const windowName = `hubspot-oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const connectUrl = `/api/hubspot/connect?config=${encodeURIComponent(JSON.stringify(cfg))}`;
    const popup = window.open(connectUrl, windowName, features);

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      showFlash("Popup blocked. Please allow popups for this site and try again.", "error", 8000);
      return;
    }

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (popup.closed) {
        if (pollRef.current) clearInterval(pollRef.current);
        refresh();
      }
    }, 800);
  }

  if (loading) {
    return <div className="text-xs text-textdim2 tracking-wider uppercase">…</div>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setShowPanel(true)}
        className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-border2 text-textdim hover:bg-panel2 hover:text-texthi"
      >
        ⚙ Integrations
      </button>
      <div className="text-[10px] tracking-wider">
        {conn ? (
          <span className="text-green">● HubSpot connected</span>
        ) : (
          <span className="text-textdim">No CRM connected</span>
        )}
      </div>

      {showConnectModal && (
        <ConnectSyncModal onContinue={handleConnect} onCancel={() => setShowConnectModal(false)} />
      )}
      {showPanel && (
        <IntegrationsPanel
          conn={conn}
          pendingMirror={pendingMirror}
          busy={busy}
          onConnectHubSpot={() => { setShowPanel(false); setShowConnectModal(true); }}
          onDisconnectHubSpot={doDisconnect}
          onPurge={doPurge}
          onPipelineSaved={refresh}
          onClose={() => setShowPanel(false)}
        />
      )}
      {flash && (
        <div className={`text-[10px] tracking-wider mt-1 max-w-xs text-right ${flashTone === "error" ? "text-red" : "text-cyan"}`}>
          {flash}
        </div>
      )}
    </div>
  );
}
