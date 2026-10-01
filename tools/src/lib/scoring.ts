import { loadAnswers, savedAnswersPath, sessionAnswersPath } from "./catalog.ts";
import { loadPipelineConfig, type PipelineConfig } from "./pipeline-config.ts";
import { repoRoot } from "./repo.ts";

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

/** The bar a posting's score must reach: what the setting is, and where it came from. */
export type Minimum = { value: number; source: string };

/** The minimum an answer states: its first number (a fraction such as 0.6 counts as 60), 0 for "none" or "any", else null. */
export function parseMinimum(answer: string): number | null {
  const n = answer.match(/\d+(?:\.\d+)?/)?.[0];
  if (n !== undefined) {
    const v = Number(n) > 0 && Number(n) < 1 ? Number(n) * 100 : Number(n);
    return Math.min(100, Math.round(v));
  }
  return /\b(none|no minimum|any|anything|no bar)\b/i.test(answer) ? 0 : null;
}

/**
 * The person's minimum fit score: their `prefs.min-fit` answer from this session, else their saved one,
 * else `score.minimum` from the pipeline config. The first answer given decides: one without a number
 * ("strong matches") falls back to the pipeline default, and the source says so.
 */
export function minimumScore(person: string, root = repoRoot(), config: PipelineConfig = loadPipelineConfig(root)): Minimum {
  const sources = [["session answer", sessionAnswersPath(person, root)], ["saved answer", savedAnswersPath(person, root)]] as const;
  for (const [source, path] of sources) {
    const answer = loadAnswers(path).get("prefs.min-fit")?.answer.trim();
    if (!answer) continue;
    const value = parseMinimum(answer);
    return value === null
      ? { value: config.score.minimum, source: `pipeline default (the ${source} "${answer}" states no number; record one with \`onboarding answer prefs.min-fit\`)` }
      : { value, source };
  }
  return { value: config.score.minimum, source: "pipeline default" };
}
