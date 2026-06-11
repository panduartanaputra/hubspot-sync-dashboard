// POST /api/hubspot/disconnect
// Marks the active connection inactive. Existing HubSpot data is left alone (per design decision).

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const { error } = await supabaseServer()
    .from("hubspot_connections")
    .update({ is_active: false, disconnected_at: new Date().toISOString() })
    .eq("is_active", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
