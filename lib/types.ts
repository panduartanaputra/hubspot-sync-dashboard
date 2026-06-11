// Type definitions mirroring the supabase-lab schema.

export type OpportunityStatus =
  | "interested"
  | "introduction"
  | "qualified"
  | "disqualified"
  | "closed_won"
  | "closed_lost";

export type MeetingStatus =
  | "booked"
  | "held"
  | "no_show"
  | "cancelled"
  | "rescheduled";

export interface Organization {
  id: string;
  name: string | null;
  domain: string;
  industry: string | null;
  employee_count: number | null;
  hq_city: string | null;
  hq_country: string | null;
}

export interface Person {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  primary_organization_id: string | null;
}

export interface Opportunity {
  id: string;
  client_id: string;
  organization_id: string;
  title: string;
  status: OpportunityStatus;
  value_usd: number | null;
  source_channel: string | null;
  qualification_notes: string | null;
  lead_score: number | null;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  pushed_to_hubspot_at: string | null;
  last_synced_at: string | null;
  closed_lost_reason: string | null;
  last_change_source: "dashboard" | "hubspot_inbound" | "seed" | "backfill" | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  opportunity_id: string;
  primary_person_id: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  meeting_link: string | null;
  status: MeetingStatus;
  outcome_notes: string | null;
  held_at: string | null;
  no_show_at: string | null;
  cancelled_at: string | null;
}

export interface SyncLogRow {
  id: string;
  opportunity_id: string | null;
  meeting_id: string | null;
  destination: "hubspot" | "hubspot_inbound" | "slack" | "email" | "other" | string;
  action: string;
  status: "success" | "failure" | "retrying";
  error_message: string | null;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  attempted_at: string;
  duration_ms: number | null;
}

/** A denormalized lead row used by the kanban board. */
export interface LeadCard {
  opportunity: Opportunity;
  organization: Organization;
  primaryPerson: Person | null;
  latestMeeting: Meeting | null;
  /** Derived: which kanban column this card belongs to. */
  column: KanbanColumn;
}

export type KanbanColumn =
  | "interested"
  | "qualified"
  | "meeting_booked"
  | "meeting_held"
  | "closed";

export const KANBAN_COLUMNS: { id: KanbanColumn; label: string; tone: string }[] = [
  { id: "interested",     label: "Interested",      tone: "bg-stage-interested/15 border-stage-interested/40" },
  { id: "qualified",      label: "Qualified",       tone: "bg-stage-qualified/15 border-stage-qualified/40" },
  { id: "meeting_booked", label: "Meeting Booked",  tone: "bg-stage-booked/20 border-stage-booked/50" },
  { id: "meeting_held",   label: "Meeting Held",    tone: "bg-stage-held/15 border-stage-held/40" },
  { id: "closed",         label: "Closed",          tone: "bg-stage-disqualified/15 border-stage-disqualified/40" },
];

/** Derive the kanban column for a lead based on opp.status + meeting.status. */
export function leadColumn(opp: Opportunity, meeting: Meeting | null): KanbanColumn {
  if (opp.status === "disqualified" || opp.status === "closed_won" || opp.status === "closed_lost") return "closed";
  if (meeting?.status === "no_show" || meeting?.status === "cancelled") return "closed";
  if (meeting?.status === "held") return "meeting_held";
  if (meeting?.status === "booked") return "meeting_booked";
  if (opp.status === "qualified" || opp.status === "introduction") return "qualified";
  return "interested";
}
