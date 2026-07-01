// POST /api/hubspot/purge   body (optional): { connectionId?: string }
// Immediate hard-delete of mirrored CRM data (GDPR erasure), no 30-day wait.
//   - with connectionId  → purge THAT connection's mirror (live + soft), so a
//     still-connected user can erase what Metis holds on demand.
//   - without connectionId → purge all soft-deleted rows (post-disconnect erase).

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  let connectionId: string | undefined;
  try {
    const body = await req.json();
    connectionId = typeof body?.connectionId === "string" ? body.connectionId : undefined;
  } catch { /* no body → grace purge */ }

  const sb = supabaseServer();
  const { data, error } = connectionId
    ? await sb.rpc("purge_hubspot_mirror_for_connection", { p_connection_id: connectionId })
    : await sb.rpc("purge_hubspot_mirror", { grace_days: 0 });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, purged: data ?? 0 });
}
