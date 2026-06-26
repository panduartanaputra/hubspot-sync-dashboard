"use client";

import { supabase } from "./supabase";
import { LeadCard, Meeting, Opportunity, Organization, Person, SyncLogRow, leadColumn } from "./types";

/** Fetch all leads with their org, primary person, and latest meeting. */
export async function fetchLeads(): Promise<LeadCard[]> {
  const [oppsRes, orgsRes, personsRes, meetingsRes, junctionsRes] = await Promise.all([
    supabase.from("opportunities").select("*"),
    supabase.from("organizations").select("*"),
    supabase.from("persons").select("*"),
    supabase.from("meetings").select("*").order("scheduled_at", { ascending: false }),
    supabase.from("opportunity_persons").select("*").eq("is_primary", true).is("removed_at", null),
  ]);

  if (oppsRes.error)     throw oppsRes.error;
  if (orgsRes.error)     throw orgsRes.error;
  if (personsRes.error)  throw personsRes.error;
  if (meetingsRes.error) throw meetingsRes.error;
  if (junctionsRes.error) throw junctionsRes.error;

  const opps     = (oppsRes.data ?? []) as Opportunity[];
  const orgs     = (orgsRes.data ?? []) as Organization[];
  const persons  = (personsRes.data ?? []) as Person[];
  const meetings = (meetingsRes.data ?? []) as Meeting[];
  const junctions = junctionsRes.data ?? [];

  const orgById = new Map(orgs.map(o => [o.id, o]));
  const personById = new Map(persons.map(p => [p.id, p]));
  const personByOpp = new Map(
    junctions.map(j => [j.opportunity_id, personById.get(j.person_id) ?? null]),
  );

  // latest meeting per opportunity (meetings already ordered desc)
  const meetingByOpp = new Map<string, Meeting>();
  for (const m of meetings) if (!meetingByOpp.has(m.opportunity_id)) meetingByOpp.set(m.opportunity_id, m);

  return opps.map(opp => {
    const organization = orgById.get(opp.organization_id)!;
    const primaryPerson = personByOpp.get(opp.id) ?? null;
    const latestMeeting = meetingByOpp.get(opp.id) ?? null;
    return {
      opportunity: opp,
      organization,
      primaryPerson,
      latestMeeting,
      column: leadColumn(opp, latestMeeting),
    };
  });
}

export async function fetchSyncLog(limit = 25): Promise<SyncLogRow[]> {
  const { data, error } = await supabase
    .from("sync_log")
    .select("*")
    .order("attempted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SyncLogRow[];
}

/** Book a meeting for an opportunity. Inserts a meetings row → trigger fires HubSpot push. */
export async function bookMeeting(args: {
  opportunityId: string;
  primaryPersonId: string | null;
  scheduledAt: string;       // ISO timestamp
  meetingLink?: string;
  agenda?: string;
}) {
  const { error } = await supabase.from("meetings").insert({
    opportunity_id: args.opportunityId,
    primary_person_id: args.primaryPersonId,
    scheduled_at: args.scheduledAt,
    meeting_link: args.meetingLink ?? null,
    agenda: args.agenda ?? null,
    status: "booked",
  });
  if (error) throw error;
}

/** Update an existing meeting's status (held / no_show / cancelled / rescheduled). */
export async function updateMeetingStatus(meetingId: string, status: "held" | "no_show" | "cancelled" | "rescheduled", outcomeNotes?: string) {
  const updates: Record<string, unknown> = { status };
  if (status === "held")      updates.held_at = new Date().toISOString();
  if (status === "no_show")   updates.no_show_at = new Date().toISOString();
  if (status === "cancelled") updates.cancelled_at = new Date().toISOString();
  if (outcomeNotes) updates.outcome_notes = outcomeNotes;

  const { error } = await supabase.from("meetings").update(updates).eq("id", meetingId);
  if (error) throw error;
}

import type { PipelinesPayload } from "./hubspotPipelines";

export interface HubSpotConnection {
  id: string;
  hubspot_portal_id: number;
  hubspot_user_email: string | null;
  hub_domain: string | null;
  scopes: string[];
  connected_at: string;
  is_active: boolean;
  pipeline_id: string | null;
  stage_map: Record<string, string> | null;
  pipelines_cache: PipelinesPayload | null;
  pipelines_cached_at: string | null;
}

export async function fetchActiveConnection(): Promise<HubSpotConnection | null> {
  const { data, error } = await supabase
    .from("hubspot_connections")
    .select("id,hubspot_portal_id,hubspot_user_email,hub_domain,scopes,connected_at,is_active,pipeline_id,stage_map,pipelines_cache,pipelines_cached_at")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as HubSpotConnection | null;
}

export async function savePipelineMapping(args: {
  pipeline_id: string | null;
  stage_map: Record<string, string> | null;
}) {
  const res = await fetch("/api/hubspot/pipeline", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Save pipeline failed: ${await res.text()}`);
}

export async function disconnectHubSpot() {
  const res = await fetch("/api/hubspot/disconnect", { method: "POST" });
  if (!res.ok) throw new Error(`Disconnect failed: ${await res.text()}`);
}

/** Mark an opportunity as disqualified (no meeting involved). */
export async function disqualifyOpportunity(opportunityId: string, reason?: string) {
  const updates: Record<string, unknown> = { status: "disqualified" };
  if (reason) updates.qualification_notes = reason;
  const { error } = await supabase.from("opportunities").update(updates).eq("id", opportunityId);
  if (error) throw error;
}
