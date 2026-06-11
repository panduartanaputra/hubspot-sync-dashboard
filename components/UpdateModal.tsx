"use client";

import { useEffect, useState } from "react";

const POLL_MS = 30_000;

export default function UpdateModal() {
  const myBuildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newBuildId, setNewBuildId] = useState<string | null>(null);

  useEffect(() => {
    // Skip in local development — there's no deployment to compare against
    if (myBuildId === "dev") return;

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (cancelled) return;
        if (data.buildId && data.buildId !== myBuildId) {
          setNewBuildId(data.buildId);
          setUpdateAvailable(true);
        }
      } catch {
        // ignore network errors — try again next interval
      }
    }

    check();
    const interval = setInterval(check, POLL_MS);

    // Also check immediately when the tab regains focus, in case the user came back after a long absence
    function onFocus() { check(); }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [myBuildId]);

  if (!updateAvailable) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      className="fixed inset-0 z-[100] bg-bg/90 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <div className="w-full max-w-md border border-gold/60 bg-panel shadow-[0_0_40px_rgba(224,160,48,0.15)]">
        <div className="px-5 py-3 border-b border-border">
          <div className="label-eyebrow">UPDATE AVAILABLE</div>
        </div>
        <div className="px-5 py-5">
          <h2
            id="update-modal-title"
            className="font-serif text-[20px] font-bold text-texthi leading-tight"
          >
            A new version of the cockpit is live
          </h2>
          <p className="text-[12px] text-textdim mt-2 leading-relaxed">
            The dashboard you have open is running an older build. Refresh now to load the latest version. Unsaved changes (if any) will be lost.
          </p>
          <div className="text-[10px] text-textdim2 tracking-wider uppercase mt-4 font-mono flex gap-2 items-center flex-wrap">
            <span className="text-textdim2">CURRENT:</span>
            <span className="text-textdim">{myBuildId}</span>
            <span className="text-textdim2">→</span>
            <span className="text-textdim2">NEW:</span>
            <span className="text-gold">{newBuildId}</span>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={() => window.location.reload()}
            autoFocus
            className="text-[11px] font-bold tracking-[0.15em] uppercase px-4 py-2 border border-gold text-gold hover:bg-gold/10"
          >
            Refresh Now
          </button>
        </div>
      </div>
    </div>
  );
}
