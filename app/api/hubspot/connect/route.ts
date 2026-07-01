// GET /api/hubspot/connect?config=<url-encoded JSON SyncConfig>
// Mints a CSRF state, stores it (with the user's push/pull choices) in Supabase,
// then redirects the user to HubSpot's OAuth consent page with dynamically
// assembled scope (locked) + optional_scope (user-selected) params.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  buildAuthScopeParams,
  normalizeSyncConfig,
  defaultSyncConfig,
  type SyncConfig,
} from "@/lib/hubspotScopes";
import crypto from "crypto";

const CLIENT_ID = process.env.HUBSPOT_OAUTH_CLIENT_ID;
const REDIRECT_URI = process.env.HUBSPOT_OAUTH_REDIRECT_URI; // e.g. https://hubspot-sync-dashboard.vercel.app/api/hubspot/callback

export async function GET(req: Request) {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json(
      { error: "Missing HUBSPOT_OAUTH_CLIENT_ID or HUBSPOT_OAUTH_REDIRECT_URI env vars." },
      { status: 500 },
    );
  }

  // Parse the consent selection. Absent/invalid → safe defaults (core push only,
  // no pull) so a direct hit to this endpoint still yields a working connection.
  let cfg: SyncConfig;
  try {
    const raw = new URL(req.url).searchParams.get("config");
    cfg = raw ? normalizeSyncConfig(JSON.parse(raw)) : defaultSyncConfig();
  } catch {
    cfg = defaultSyncConfig();
  }

  const { scope, optionalScope } = buildAuthScopeParams(cfg);

  // Mint a one-time state token for CSRF protection; stash the selection on it
  // so the callback can persist it (HubSpot won't echo arbitrary data back).
  const state = crypto.randomBytes(24).toString("hex");
  const { error } = await supabaseServer()
    .from("hubspot_oauth_states")
    .insert({ state, client_id: null, sync_config: cfg });
  if (error) {
    return NextResponse.json({ error: `Failed to store OAuth state: ${error.message}` }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope,
    state,
  });
  // Only include optional_scope when the user selected at least one optional
  // capability — an empty param is unnecessary noise on the consent screen.
  if (optionalScope) params.set("optional_scope", optionalScope);

  // app.hubspot.com is the standard authorize endpoint for all NA datacenters
  const authorizeUrl = `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl);
}
