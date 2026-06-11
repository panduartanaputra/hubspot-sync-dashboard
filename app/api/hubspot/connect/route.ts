// GET /api/hubspot/connect
// Mints a CSRF state, stores it in Supabase, then redirects the user to HubSpot's OAuth consent page.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import crypto from "crypto";

const CLIENT_ID = process.env.HUBSPOT_OAUTH_CLIENT_ID;
const REDIRECT_URI = process.env.HUBSPOT_OAUTH_REDIRECT_URI; // e.g. https://hubspot-sync-dashboard.vercel.app/api/hubspot/callback

// Must match scopes declared in app-hsmeta.json
const SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.schemas.contacts.write",
  "crm.schemas.deals.write",
].join(" ");

export async function GET(req: Request) {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json(
      { error: "Missing HUBSPOT_OAUTH_CLIENT_ID or HUBSPOT_OAUTH_REDIRECT_URI env vars." },
      { status: 500 },
    );
  }

  // Mint a one-time state token for CSRF protection
  const state = crypto.randomBytes(24).toString("hex");

  const { error } = await supabaseServer()
    .from("hubspot_oauth_states")
    .insert({ state, client_id: null });
  if (error) {
    return NextResponse.json({ error: `Failed to store OAuth state: ${error.message}` }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
  });

  // app.hubspot.com is the standard authorize endpoint for all NA datacenters
  const authorizeUrl = `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl);
}
