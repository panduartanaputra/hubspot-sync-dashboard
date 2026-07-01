"use client";

// Lets the user pick which HubSpot deal pipeline SalesOS should sync into,
// and customize which stage each meeting status maps to. Reads pipelines_cache
// from the connection (populated during OAuth) so it doesn't hit HubSpot on
// every render. Saves via PATCH /api/hubspot/pipeline.

import { useMemo, useState } from "react";
import { savePipelineMapping, refreshPipelines, type HubSpotConnection } from "@/lib/queries";
import { SALESOS_STATUSES, type Pipeline, type SalesOsStatus } from "@/lib/hubspotPipelines";

const STATUS_LABEL: Record<SalesOsStatus, string> = {
  booked: "Meeting booked",
  held: "Meeting held",
  no_show: "No-show",
  cancelled: "Meeting cancelled",
  closed_won: "Opportunity won",
  closed_lost: "Opportunity lost",
};

interface Props {
  conn: HubSpotConnection;
  onSaved?: () => void;
}

export default function PipelineMapper({ conn, onSaved }: Props) {
  const pipelines: Pipeline[] = useMemo(
    () => (conn.pipelines_cache?.results ?? []).filter((p) => !p.archived),
    [conn.pipelines_cache],
  );

  const [pipelineId, setPipelineId] = useState<string | null>(
    conn.pipeline_id ?? pipelines[0]?.id ?? null,
  );
  const [stageMap, setStageMap] = useState<Record<string, string>>(conn.stage_map ?? {});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await refreshPipelines();
      onSaved?.(); // reloads the connection → fresh pipelines_cache flows back in as props
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  const currentPipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId) ?? null,
    [pipelines, pipelineId],
  );
  const stages = useMemo(
    () => (currentPipeline?.stages ?? []).filter((s) => !s.archived),
    [currentPipeline],
  );

  function setStage(status: SalesOsStatus, stageId: string) {
    setStageMap((prev) => {
      const next = { ...prev };
      if (!stageId) delete next[status]; else next[status] = stageId;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await savePipelineMapping({
        pipeline_id: pipelineId,
        stage_map: Object.keys(stageMap).length > 0 ? stageMap : null,
      });
      setSavedAt(Date.now());
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (pipelines.length === 0) {
    return (
      <div className="text-xs text-neutral-500 flex items-center gap-2">
        No pipelines cached yet.
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="underline text-neutral-300 hover:text-white disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "↻ Refresh from HubSpot"}
        </button>
        {error && <span className="text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <label className="text-neutral-400 uppercase tracking-wider" htmlFor="pipeline-select">
          Pipeline
        </label>
        <select
          id="pipeline-select"
          value={pipelineId ?? ""}
          onChange={(e) => {
            setPipelineId(e.target.value || null);
            setStageMap({});
          }}
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Re-pull pipelines from HubSpot (picks up newly-created ones)"
          className="text-neutral-400 hover:text-white disabled:opacity-50"
        >
          {refreshing ? "↻…" : "↻ Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {SALESOS_STATUSES.map((status) => (
          <div key={status} className="flex items-center gap-2">
            <span className="w-36 text-neutral-400">{STATUS_LABEL[status]}</span>
            <select
              value={stageMap[status] ?? ""}
              onChange={(e) => setStage(status, e.target.value)}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200"
            >
              <option value="">— default —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-neutral-100 text-neutral-900 rounded px-3 py-1 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save mapping"}
        </button>
        {savedAt && !error && (
          <span className="text-emerald-400">Saved.</span>
        )}
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}
