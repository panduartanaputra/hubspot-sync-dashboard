// POST /api/hubspot/disconnect
// Marks the active connection inactive AND soft-deletes its mirrored CRM data
// (hidden from the app immediately). Data from the client's own HubSpot is left
// untouched. Soft-deleted mirror rows enter a 30-day grace window: reconnect
// restores them; otherwise a scheduled purge hard-deletes them (GDPR
// storage-limitation — we hold pulled personal data only while connected).

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  const sb = supabaseServer();

  // Grab the active connections so we can soft-delete their mirror rows.
  const { data: active } = await sb
    .from("hubspot_connections").select("id").eq("is_active", true);
  const ids = (active ?? []).map((r) => r.id);

  const { error } = await sb
    .from("hubspot_connections")
    .update({ is_active: false, disconnected_at: new Date().toISOString() })
    .eq("is_active", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let mirrorSoftDeleted = 0;
  if (ids.length) {
    const { count } = await sb
      .from("hubspot_mirror")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .in("connection_id", ids)
      .is("deleted_at", null);
    mirrorSoftDeleted = count ?? 0;
  }

  return NextResponse.json({ ok: true, mirror_soft_deleted: mirrorSoftDeleted });
}
