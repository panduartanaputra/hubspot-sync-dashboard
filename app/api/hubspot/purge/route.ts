// POST /api/hubspot/purge
// "Purge now" — immediately hard-deletes soft-deleted mirror data (grace 0),
// instead of waiting for the 30-day scheduled purge. Used after a disconnect
// when the user wants their mirrored CRM data gone right away (GDPR erasure).

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const { data, error } = await supabaseServer().rpc("purge_hubspot_mirror", { grace_days: 0 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, purged: data ?? 0 });
}
