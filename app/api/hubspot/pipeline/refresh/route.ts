// POST /api/hubspot/pipeline/refresh
// Re-pulls the connected portal's deal pipelines from HubSpot and updates
// pipelines_cache on the active connection — so pipelines created in HubSpot
// AFTER connect (which aren't auto-polled) show up without a full reconnect.
// Returns the fresh pipelines payload.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { PipelinesPayload } from "@/lib/hubspotPipelines";

const CLIENT_ID = process.env.HUBSPOT_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_OAUTH_CLIENT_SECRET;

// Ensure a usable access token; refresh in place if it's within 2 min of expiry.
// Mirrors the edge-function refresh so the Next side can call HubSpot directly.
async function freshToken(sb: ReturnType<typeof supabaseServer>, conn: {
  id: string; access_token: string; refresh_token: string; expires_at: string;
}): Promise<string> {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 120_000) return conn.access_token;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Missing HubSpot OAuth env for refresh");

  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 || res.status === 403) {
      await sb.from("hubspot_connections").update({
        reauth_required: true, reauth_reason: `pipeline refresh: ${res.status}`, reauth_at: new Date().toISOString(),
      }).eq("id", conn.id);
    }
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }
  const tokens = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  await sb.from("hubspot_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
    last_refresh_at: new Date().toISOString(),
  }).eq("id", conn.id);
  return tokens.access_token;
}

export async function POST() {
  const sb = supabaseServer();
  const { data: conn } = await sb
    .from("hubspot_connections")
    .select("id, access_token, refresh_token, expires_at")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: "No active HubSpot connection" }, { status: 404 });

  let token: string;
  try {
    token = await freshToken(sb, conn as { id: string; access_token: string; refresh_token: string; expires_at: string });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const res = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Pipelines fetch failed: ${res.status} ${await res.text()}` }, { status: 502 });
  }
  const pipelines = await res.json() as PipelinesPayload;

  await sb.from("hubspot_connections").update({
    pipelines_cache: pipelines,
    pipelines_cached_at: new Date().toISOString(),
  }).eq("id", conn.id);

  return NextResponse.json({ ok: true, pipelines });
}
