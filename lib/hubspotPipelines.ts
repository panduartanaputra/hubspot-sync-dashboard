// Helpers for working with HubSpot deal pipelines + stages.
// Used by the OAuth callback to seed initial pipeline_id + stage_map,
// and by the dashboard UI to render the pipeline / stage picker.

export interface PipelineStage {
  id: string;
  label: string;
  displayOrder?: number;
  metadata?: Record<string, unknown>;
  archived?: boolean;
}

export interface Pipeline {
  id: string;
  label: string;
  displayOrder?: number;
  stages: PipelineStage[];
  archived?: boolean;
}

export interface PipelinesPayload {
  results: Pipeline[];
}

// SalesOS statuses we want to map to a HubSpot stage_id.
export const SALESOS_STATUSES = [
  "booked",
  "held",
  "no_show",
  "cancelled",
  "closed_won",
  "closed_lost",
] as const;
export type SalesOsStatus = typeof SALESOS_STATUSES[number];

// Pick a default pipeline from the user's portal. We prefer the one literally
// called "Sales Pipeline" or with id "default", otherwise the lowest
// displayOrder, otherwise the first non-archived entry.
export function pickDefaultPipeline(payload: PipelinesPayload): Pipeline | null {
  const live = (payload.results ?? []).filter((p) => !p.archived);
  if (live.length === 0) return null;
  const byId = live.find((p) => p.id === "default");
  if (byId) return byId;
  const byLabel = live.find((p) => /sales/i.test(p.label));
  if (byLabel) return byLabel;
  const sorted = [...live].sort(
    (a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER),
  );
  return sorted[0];
}

// Label-keyword heuristic for auto-mapping a pipeline's stages to SalesOS
// statuses. Returns a partial map — missing entries mean the adapter falls
// back to the default HubSpot stage IDs (works for default Sales Pipeline only).
//
// We deliberately keep this loose; the user can refine the mapping in the UI.
export function buildStageMapFromLabels(pipeline: Pipeline): Record<string, string> {
  const stages = (pipeline.stages ?? []).filter((s) => !s.archived);
  const map: Record<string, string> = {};

  const find = (test: (label: string) => boolean): string | undefined =>
    stages.find((s) => test(s.label.toLowerCase()))?.id;

  // booked / scheduled
  const booked = find((l) => /appointment|booked|scheduled|discovery|intro/.test(l));
  if (booked) map.booked = booked;

  // held / qualified / demo
  const held = find((l) => /qualified|held|demo|presentation|proposal/.test(l));
  if (held) map.held = held;

  // no-show / cancelled — usually "Closed Lost" or a dedicated stage
  const lost = find((l) => /closed?\s*lost|lost/.test(l));
  if (lost) {
    map.no_show = lost;
    map.cancelled = lost;
    map.closed_lost = lost;
  }
  const noShow = find((l) => /no\s*-?\s*show/.test(l));
  if (noShow) map.no_show = noShow;
  const cancelled = find((l) => /cancel/.test(l));
  if (cancelled) map.cancelled = cancelled;

  // won
  const won = find((l) => /closed?\s*won|won/.test(l));
  if (won) map.closed_won = won;

  return map;
}
