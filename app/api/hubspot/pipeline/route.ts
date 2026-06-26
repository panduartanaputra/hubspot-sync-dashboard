// PATCH /api/hubspot/pipeline
// Saves the user's chosen deal pipeline_id + stage_map onto the active
// HubSpot connection. The edge functions read these on their next invocation,
// so no redeploy is needed when the user remaps stages.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { SALESOS_STATUSES } from "@/lib/hubspotPipelines";

interface PatchBody {
  pipeline_id?: string | null;
  stage_map?: Record<string, string> | null;
}

function isValidStageMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return true;
  for (const [k, v] of entries) {
    if (!(SALESOS_STATUSES as readonly string[]).includes(k)) return false;
    if (typeof v !== "string" || v.length === 0) return false;
  }
  return true;
}

export async function PATCH(req: Request) {
  let body: PatchBody;
  try {
    body = await req.json() as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.stage_map !== undefined && body.stage_map !== null && !isValidStageMap(body.stage_map)) {
    return NextResponse.json({
      error: "stage_map must be an object with SalesOS status keys and non-empty string stage IDs",
    }, { status: 400 });
  }
  if (body.pipeline_id !== undefined && body.pipeline_id !== null && typeof body.pipeline_id !== "string") {
    return NextResponse.json({ error: "pipeline_id must be a string or null" }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data: active } = await sb
    .from("hubspot_connections")
    .select("id")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active) {
    return NextResponse.json({ error: "No active HubSpot connection" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.pipeline_id !== undefined) updates.pipeline_id = body.pipeline_id;
  if (body.stage_map !== undefined) updates.stage_map = body.stage_map;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await sb.from("hubspot_connections").update(updates).eq("id", active.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
