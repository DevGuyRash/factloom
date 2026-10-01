import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { dataLayers } from "./layers.ts";
import { repoRoot } from "./repo.ts";

/** The pipeline numbers every command reads instead of hardcoding: see shared/pipeline.yaml. */
export type PipelineConfig = {
  follow_up_days: number;
  stale_queue_days: number;
  hours_per_year: number;
  score: {
    weights: { must_haves: number; pay_ok: number; arrangement_ok: number; location_ok: number; seniority: number; preferred: number };
    seniority_credit: { match: number; stretch: number; over: number };
  };
};

const DEFAULTS: PipelineConfig = {
  follow_up_days: 7,
  stale_queue_days: 10,
  hours_per_year: 2080,
  score: {
    weights: { must_haves: 35, pay_ok: 10, arrangement_ok: 10, location_ok: 10, seniority: 20, preferred: 15 },
    seniority_credit: { match: 1, stretch: 0.6, over: 0.5 },
  },
};

/** The pipeline config files in merge order: shared/pipeline.yaml, then custom/pipeline.yaml. */
export const pipelineLayers = (root = repoRoot()): string[] => dataLayers("pipeline.yaml", root);

function merge(base: PipelineConfig, raw: Partial<PipelineConfig>): PipelineConfig {
  return {
    ...base,
    ...raw,
    score: {
      weights: { ...base.score.weights, ...(raw.score?.weights ?? {}) },
      seniority_credit: { ...base.score.seniority_credit, ...(raw.score?.seniority_credit ?? {}) },
    },
  };
}

/** The pipeline numbers: defaults, then shared/pipeline.yaml, then custom/pipeline.yaml, so a partial or missing file still works. */
export function loadPipelineConfig(root = repoRoot()): PipelineConfig {
  let config = DEFAULTS;
  for (const path of pipelineLayers(root)) {
    if (existsSync(path)) config = merge(config, (YAML.parse(readFileSync(path, "utf8")) ?? {}) as Partial<PipelineConfig>);
  }
  return config;
}
