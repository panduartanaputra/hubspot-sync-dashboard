// GET /api/hubspot/callback?code=...&state=...
// Exchanges the authorization code for access + refresh tokens, stores the connection in Supabase,
// then either:
//   - if in a popup: returns HTML that postMessages success/error to window.opener and closes itself
//   - if loaded directly: redirects back to the dashboard with query params

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const CLIENT_ID = process.env.HUBSPOT_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.HUBSPOT_OAUTH_REDIRECT_URI;
const APP_ID = process.env.HUBSPOT_OAUTH_APP_ID;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function htmlResult(args: { ok: boolean; payload: Record<string, unknown>; redirectTarget: string }) {
  // Returns an HTML page that:
  //   - if window.opener exists (popup case): postMessage to opener, then close()
  //   - else (direct navigation): redirect to dashboard with query params
  const safePayload = JSON.stringify({ type: "hubspot-oauth", ...args.payload });
  const safeOrigin  = JSON.stringify(new URL(APP_URL).origin);
  const safeRedirect = JSON.stringify(args.redirectTarget);
  const title = args.ok ? "Connected" : "Connection failed";
  const colorAccent = args.ok ? "#50B868" : "#D05858";
  const message = args.ok ? "✓ Connected to HubSpot" : "✗ Connection failed";
  const sub = args.ok ? "You can close this window." : "Check the dashboard for details.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { margin:0; background:#080808; color:#E2E2E2; font-family:ui-monospace,Menlo,monospace;
           display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; }
    .accent { color:${colorAccent}; font-size:14px; font-weight:700; letter-spacing:0.1em; }
    .sub { color:#737373; font-size:12px; margin-top:8px; letter-spacing:0.05em; }
  </style>
</head>
<body>
  <div>
    <div class="accent">${message}</div>
    <div class="sub">${sub}</div>
  </div>
  <script>
    (function() {
      var payload = ${safePayload};
      var origin  = ${safeOrigin};
      var redirectTarget = ${safeRedirect};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, origin);
          setTimeout(function() { window.close(); }, 400);
          return;
        }
      } catch (e) { /* ignore cross-origin issues */ }
      // No opener -> direct navigation, fall back to redirect
      window.location.replace(redirectTarget);
    })();
  </script>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function errorResult(message: string) {
  const target = new URL(APP_URL);
  target.searchParams.set("oauth_error", message);
  return htmlResult({
    ok: false,
    payload: { oauth_error: message },
    redirectTarget: target.toString(),
  });
}

export async function GET(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return errorResult("Missing OAuth env vars on server");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const hubspotError = url.searchParams.get("error");

  if (hubspotError) return errorResult(`HubSpot returned error: ${hubspotError}`);
  if (!code || !state) return errorResult("Missing code or state from HubSpot redirect");

  const sb = supabaseServer();

  // Atomic state claim: UPDATE ... WHERE consumed_at IS NULL RETURNING *.
  // Race-safe at the DB level — concurrent callbacks (HubSpot's "previously
  // authorized, redirecting…" can fire the URL twice) can both attempt this,
  // but only one will get a row back. Replaces the SELECT-then-UPDATE check
  // which had a TOCTOU window between the two statements.
  const { data: claimed, error: claimErr } = await sb
    .from("hubspot_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .is("consumed_at", null)
    .select();
  if (claimErr) return errorResult(`State claim failed: ${claimErr.message}`);

  if (!claimed || claimed.length === 0) {
    // The state was either never minted (CSRF/replay) OR was already claimed by
    // a concurrent callback. For the latter, the prior execution likely already
    // saved a working connection — make this idempotent so the user doesn't see
    // a misleading error after a successful flow.
    const { data: anyStateRow } = await sb
      .from("hubspot_oauth_states").select("state").eq("state", state).maybeSingle();
    if (!anyStateRow) return errorResult("Invalid or expired OAuth state (possible CSRF)");

    const { data: recentConn } = await sb
      .from("hubspot_connections")
      .select("hubspot_portal_id")
      .gte("connected_at", new Date(Date.now() - 60_000).toISOString())
      .eq("is_active", true)
      .order("connected_at", { ascending: false })
      .limit(1).maybeSingle();
    if (recentConn) {
      const t = new URL(APP_URL);
      t.searchParams.set("oauth", "connected");
      t.searchParams.set("portal", String(recentConn.hubspot_portal_id));
      return htmlResult({
        ok: true,
        payload: { oauth: "connected", portal: recentConn.hubspot_portal_id },
        redirectTarget: t.toString(),
      });
    }
    return errorResult("OAuth state already used and no recent connection to attribute it to");
  }

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
    return errorResult(`Token exchange failed: ${tokenRes.status} ${text}`);
  }
  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token: string; expires_in: number; token_type: string;
  };

  // Look up portal info
  const accountRes = await fetch("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!accountRes.ok) {
    const text = await accountRes.text();
    return errorResult(`Failed to fetch HubSpot account info: ${accountRes.status} ${text}`);
  }
  const account = await accountRes.json() as {
    portalId: number; accountType: string; timeZone: string; uiDomain: string;
  };

  // Token introspection (best-effort: gives scopes + user)
  let scopes: string[] = [];
  let userEmail: string | null = null;
  let userId: number | null = null;
  const introspectRes = await fetch(
    `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(tokens.access_token)}`,
  );
  if (introspectRes.ok) {
    const introspect = await introspectRes.json() as {
      user?: string; user_id?: number; scopes?: string[];
    };
    scopes = introspect.scopes ?? [];
    userEmail = introspect.user ?? null;
    userId = introspect.user_id ?? null;
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const { data: anyClient } = await sb.from("clients").select("id").limit(1).maybeSingle();

  // ─────────────────────────────────────────────────────────────────────────
  // UPSERT pattern: if a connection already exists for this portal, refresh
  // its tokens in place. Otherwise insert a new row. This eliminates the
  // deactivate-then-insert race condition where two concurrent callbacks
  // (popup retries, browser prefetches) could leave the system with no
  // active connection.
  // ─────────────────────────────────────────────────────────────────────────
  const { data: existing } = await sb
    .from("hubspot_connections")
    .select("id")
    .eq("hubspot_portal_id", account.portalId)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Refresh tokens + reactivate the existing connection row.
    const { error: updateErr } = await sb.from("hubspot_connections").update({
      client_id: anyClient?.id ?? null,
      hubspot_app_id: APP_ID ? Number(APP_ID) : null,
      hubspot_user_id: userId,
      hubspot_user_email: userEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scopes,
      hub_domain: account.uiDomain,
      is_active: true,
      disconnected_at: null,
      last_refresh_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (updateErr) return errorResult(`Failed to refresh connection: ${updateErr.message}`);
  } else {
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
    if (insertErr) return errorResult(`Failed to save connection: ${insertErr.message}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-provision our namespaced custom contact properties on the connected
  // portal. Idempotent: if a property already exists, HubSpot returns 409 and
  // we treat it as success. Never modifies pre-existing user properties.
  //
  // Property names use the `salesos_` prefix to guarantee zero collision with
  // any user-defined property on their CRM.
  // ─────────────────────────────────────────────────────────────────────────
  const propertyDefinitions = [
    {
      name: "salesos_source_lead_id",
      label: "SalesOS · Source Lead ID",
      type: "string",
      fieldType: "text",
      groupName: "contactinformation",
      description: "ID of the SalesOS opportunity this contact was synced from. Auto-managed by SalesOS Sync.",
    },
    {
      name: "salesos_meeting_at",
      label: "SalesOS · Meeting At",
      type: "datetime",
      fieldType: "date",
      groupName: "contactinformation",
      description: "Scheduled time of the meeting booked via SalesOS. Auto-managed by SalesOS Sync.",
    },
  ];

  const provisioningLog: Array<{ property: string; status: string; message?: string }> = [];

  for (const def of propertyDefinitions) {
    try {
      const propRes = await fetch(
        "https://api.hubapi.com/crm/v3/properties/contacts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(def),
        },
      );
      if (propRes.ok) {
        provisioningLog.push({ property: def.name, status: "created" });
      } else if (propRes.status === 409) {
        // Property already exists — idempotent path, do NOT modify the user's existing definition.
        provisioningLog.push({ property: def.name, status: "already_existed" });
      } else {
        const text = await propRes.text();
        provisioningLog.push({
          property: def.name,
          status: "error",
          message: `${propRes.status}: ${text.slice(0, 200)}`,
        });
      }
    } catch (e) {
      provisioningLog.push({
        property: def.name,
        status: "exception",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await sb
    .from("hubspot_connections")
    .update({
      properties_provisioned_at: new Date().toISOString(),
      provisioning_log: provisioningLog,
    })
    .eq("hubspot_portal_id", account.portalId)
    .eq("is_active", true);

  // ─────────────────────────────────────────────────────────────────────────
  // Fire-and-forget bulk backfill of every existing opportunity in Supabase.
  // The user sees their full pipeline in HubSpot within ~10-30s of clicking
  // Connect, instead of waiting for per-action pushes. Additive-only:
  // find-or-create Contacts, never overwrites existing user data.
  // ─────────────────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  // Don't await — let the callback redirect immediately while the backfill runs in the background.
  fetch(`${supabaseUrl}/functions/v1/backfill-hubspot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Authenticate to the edge function via service role (no JWT verify on the function itself).
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: "{}",
  }).catch((e) => {
    console.error("Failed to trigger backfill-hubspot:", e);
  });

  // Success — for popups, close + postMessage; for direct nav, redirect back
  const target = new URL(APP_URL);
  target.searchParams.set("oauth", "connected");
  target.searchParams.set("portal", account.portalId.toString());

  return htmlResult({
    ok: true,
    payload: { oauth: "connected", portal: account.portalId },
    redirectTarget: target.toString(),
  });
}
