import { loadPipelineConfig, type PipelineConfig } from "./pipeline-config.ts";

/** The `fit:` map a record carries for scoring; every field is optional, so a partial picture still scores. */
export type Fit = {
  must_haves_met?: number;
  must_haves_total?: number;
  pay_ok?: boolean;
  arrangement_ok?: boolean;
  location_ok?: boolean;
  seniority?: "match" | "stretch" | "over";
  preferred_met?: number;
  preferred_total?: number;
};

/**
 * A 0-100 fit score from a record's `fit:` map, weighted by shared/pipeline.yaml's `score.weights`.
 * A dimension absent from `fit` (e.g. no `pay_ok` given) is left out of both the earned and
 * possible totals, so the score is renormalized over whatever the record actually states.
 */
export function computeScore(fit: Fit, config: PipelineConfig = loadPipelineConfig()): number {
  const { weights, seniority_credit } = config.score;
  let earned = 0;
  let possible = 0;
  const add = (weight: number, fraction: number | undefined) => {
    if (fraction === undefined || Number.isNaN(fraction)) return;
    possible += weight;
    earned += weight * Math.max(0, Math.min(1, fraction));
  };
  add(weights.must_haves, fit.must_haves_total ? (fit.must_haves_met ?? 0) / fit.must_haves_total : undefined);
  add(weights.pay_ok, fit.pay_ok === undefined ? undefined : fit.pay_ok ? 1 : 0);
  add(weights.arrangement_ok, fit.arrangement_ok === undefined ? undefined : fit.arrangement_ok ? 1 : 0);
  add(weights.location_ok, fit.location_ok === undefined ? undefined : fit.location_ok ? 1 : 0);
  add(weights.seniority, fit.seniority ? seniority_credit[fit.seniority] : undefined);
  add(weights.preferred, fit.preferred_total ? (fit.preferred_met ?? 0) / fit.preferred_total : undefined);
  return possible > 0 ? Math.round((earned / possible) * 100) : 0;
}
