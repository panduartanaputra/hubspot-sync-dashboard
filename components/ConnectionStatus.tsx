"use client";

import { useEffect, useState } from "react";
import { fetchActiveConnection, disconnectHubSpot, HubSpotConnection } from "@/lib/queries";

export default function ConnectionStatus() {
  const [conn, setConn] = useState<HubSpotConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

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
    // Show flash message if redirected back from callback
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("oauth") === "connected") {
        setFlash(`Connected to portal ${sp.get("portal")}`);
        // Clean the URL
        window.history.replaceState({}, "", window.location.pathname);
        setTimeout(() => setFlash(null), 5000);
      }
      const err = sp.get("oauth_error");
      if (err) {
        setFlash(`OAuth error: ${err}`);
        window.history.replaceState({}, "", window.location.pathname);
        setTimeout(() => setFlash(null), 8000);
      }
    }
    const i = setInterval(refresh, 10000);
    return () => clearInterval(i);
  }, []);

  async function handleDisconnect() {
    if (!confirm("Disconnect HubSpot? Existing data in HubSpot will be left alone.")) return;
    setBusy(true);
    try {
      await disconnectHubSpot();
      await refresh();
      setFlash("Disconnected from HubSpot");
      setTimeout(() => setFlash(null), 4000);
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
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 border border-border2 text-textdim hover:bg-panel2 hover:text-red disabled:opacity-50 mt-0.5"
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-textdim">HubSpot CRM</div>
          <a
            href="/api/hubspot/connect"
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-1.5 border border-gold text-gold hover:bg-gold/10 mt-1"
          >
            Connect HubSpot →
          </a>
        </>
      )}
      {flash && (
        <div className="text-[10px] text-cyan tracking-wider mt-1">{flash}</div>
      )}
    </div>
  );
}
