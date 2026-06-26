"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActiveConnection, disconnectHubSpot, HubSpotConnection } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import PipelineMapper from "@/components/PipelineMapper";

export default function ConnectionStatus() {
  const [conn, setConn] = useState<HubSpotConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashTone, setFlashTone] = useState<"info" | "error">("info");
  const [showPipeline, setShowPipeline] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  function showFlash(msg: string, tone: "info" | "error" = "info", ms = 5000) {
    setFlash(msg);
    setFlashTone(tone);
    setTimeout(() => setFlash(null), ms);
  }

  async function refresh() {
    try {
      setConn(await fetchActiveConnection());
    } catch (e) {
      console.error("connection fetch failed:", e);
    } finally {
      setLoading(false);
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

  function handleConnect() {
    const w = 600;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top  = window.screenY + (window.outerHeight - h) / 2;
    const features = `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)}`;

    // Unique window name on every click so the browser NEVER reuses a stale popup
    // from a previous attempt (which would re-fire its old postMessage on focus).
    const windowName = `hubspot-oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const popup = window.open("/api/hubspot/connect", windowName, features);

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

  async function handleDisconnect() {
    if (!confirm("Disconnect HubSpot? Existing data in HubSpot will be left alone.")) return;
    setBusy(true);
    try {
      await disconnectHubSpot();
      await refresh();
      showFlash("Disconnected from HubSpot", "info", 4000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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
          <div className="flex items-center gap-1 mt-0.5">
            <button
              onClick={() => setShowPipeline((s) => !s)}
              className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2 hover:text-texthi"
            >
              {showPipeline ? "Hide pipeline" : "Pipeline ▸"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2 hover:text-red disabled:opacity-50"
            >
              Disconnect
            </button>
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
            onClick={handleConnect}
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-gold text-gold hover:bg-gold/10 mt-1"
          >
            Connect HubSpot →
          </button>
        </>
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
