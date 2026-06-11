// GET /api/hubspot/callback?code=...&state=...
// Exchanges the authorization code for access + refresh tokens, stores the connection in Supabase,
// then redirects the user back to the dashboard.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const CLIENT_ID = process.env.HUBSPOT_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.HUBSPOT_OAUTH_REDIRECT_URI;
const APP_ID = process.env.HUBSPOT_OAUTH_APP_ID;

function errorPage(message: string) {
  // Send the user back to the dashboard with an error query param.
  const target = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  target.searchParams.set("oauth_error", message);
  return NextResponse.redirect(target);
}

export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return errorPage("Missing OAuth env vars on server");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const hubspotError = url.searchParams.get("error");

  if (hubspotError) return errorPage(`HubSpot returned error: ${hubspotError}`);
  if (!code || !state) return errorPage("Missing code or state from HubSpot redirect");

  const sb = supabaseServer();

  // Verify + consume the state row
  const { data: stateRow, error: stateErr } = await sb
    .from("hubspot_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (stateErr) return errorPage(`State lookup failed: ${stateErr.message}`);
  if (!stateRow) return errorPage("Invalid or expired OAuth state (possible CSRF)");
  if (stateRow.consumed_at) return errorPage("OAuth state already used");

  // Mark the state consumed (best effort — race-safe enough for lab)
  await sb
    .from("hubspot_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state);

  // Exchange code for tokens
  const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return errorPage(`Token exchange failed: ${tokenRes.status} ${text}`);
  }
  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;        // seconds
    token_type: string;
  };

  // Look up portal info from HubSpot
  const accountRes = await fetch("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!accountRes.ok) {
    const text = await accountRes.text();
    return errorPage(`Failed to fetch HubSpot account info: ${accountRes.status} ${text}`);
  }
  const account = await accountRes.json() as {
    portalId: number;
    accountType: string;
    timeZone: string;
    uiDomain: string;
  };

  // Look up scopes + user info via token introspection endpoint
  const introspectRes = await fetch(
    `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(tokens.access_token)}`,
  );
  let scopes: string[] = [];
  let userEmail: string | null = null;
  let userId: number | null = null;
  if (introspectRes.ok) {
    const introspect = await introspectRes.json() as {
      user?: string;
      user_id?: number;
      scopes?: string[];
    };
    scopes = introspect.scopes ?? [];
    userEmail = introspect.user ?? null;
    userId = introspect.user_id ?? null;
  }

  // Deactivate any existing active connection for this portal (one-active-at-a-time)
  await sb
    .from("hubspot_connections")
    .update({ is_active: false, disconnected_at: new Date().toISOString() })
    .eq("hubspot_portal_id", account.portalId)
    .eq("is_active", true);

  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  // Pick the first client_id in the table as the "owner" of this connection (lab simplification).
  const { data: anyClient } = await sb.from("clients").select("id").limit(1).maybeSingle();

  const { error: insertErr } = await sb.from("hubspot_connections").insert({
    client_id: anyClient?.id ?? null,
    hubspot_portal_id: account.portalId,
    hubspot_app_id: APP_ID ? Number(APP_ID) : null,
    hubspot_user_id: userId,
    hubspot_user_email: userEmail,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scopes,
    hub_domain: account.uiDomain,
    is_active: true,
  });
  if (insertErr) return errorPage(`Failed to save connection: ${insertErr.message}`);

  // Success — bounce back to dashboard
  const target = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  target.searchParams.set("oauth", "connected");
  target.searchParams.set("portal", account.portalId.toString());
  return NextResponse.redirect(target);
}
