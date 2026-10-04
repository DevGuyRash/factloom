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
  const parts = scoreParts(fit, config).filter((p) => p.possible > 0);
  const possible = parts.reduce((n, p) => n + p.possible, 0);
  const earned = parts.reduce((n, p) => n + p.earned, 0);
  return possible > 0 ? Math.round((earned / possible) * 100) : 0;
}

/** Each dimension's earned and possible points; a dimension the record does not state has `possible: 0`. */
export type ScorePart = { dimension: string; earned: number; possible: number };

export function scoreParts(fit: Fit, config: PipelineConfig = loadPipelineConfig()): ScorePart[] {
  const { weights, seniority_credit } = config.score;
  const part = (dimension: string, weight: number, fraction: number | undefined): ScorePart =>
    fraction === undefined || Number.isNaN(fraction)
      ? { dimension, earned: 0, possible: 0 }
      : { dimension, earned: weight * Math.max(0, Math.min(1, fraction)), possible: weight };
  return [
    part("must-haves", weights.must_haves, fit.must_haves_total ? (fit.must_haves_met ?? 0) / fit.must_haves_total : undefined),
    part("pay", weights.pay_ok, fit.pay_ok === undefined ? undefined : fit.pay_ok ? 1 : 0),
    part("arrangement", weights.arrangement_ok, fit.arrangement_ok === undefined ? undefined : fit.arrangement_ok ? 1 : 0),
    part("location", weights.location_ok, fit.location_ok === undefined ? undefined : fit.location_ok ? 1 : 0),
    part("seniority", weights.seniority, fit.seniority ? seniority_credit[fit.seniority] : undefined),
    part("preferred", weights.preferred, fit.preferred_total ? (fit.preferred_met ?? 0) / fit.preferred_total : undefined),
  ];
}

/** "must-haves 20/35, pay 10/10, ... (location not stated)": where a score's points came from. */
export function describeParts(parts: ScorePart[]): string {
  const stated = parts.filter((p) => p.possible > 0).map((p) => `${p.dimension} ${Math.round(p.earned)}/${p.possible}`);
  const missing = parts.filter((p) => p.possible === 0).map((p) => p.dimension);
  return `${stated.join(", ")}${missing.length ? ` (not stated: ${missing.join(", ")})` : ""}`;
}

/**
 * A fit map from a short spec, for screening a posting before it has a record:
 * "must_haves=3/7 pay_ok=yes arrangement_ok=yes location_ok=no seniority=stretch preferred=1/3".
 */
export function parseFitSpec(spec: string): Fit {
  const fit: Fit = {};
  for (const pair of spec.trim().split(/[\s,]+/).filter(Boolean)) {
    const [key, value = ""] = pair.split("=");
    const ratio = value.match(/^(\d+)\/(\d+)$/);
    const yes = /^(yes|true|y|1)$/i.test(value), no = /^(no|false|n|0)$/i.test(value);
    if (key === "must_haves" && ratio) Object.assign(fit, { must_haves_met: Number(ratio[1]), must_haves_total: Number(ratio[2]) });
    else if (key === "preferred" && ratio) Object.assign(fit, { preferred_met: Number(ratio[1]), preferred_total: Number(ratio[2]) });
    else if (["pay_ok", "arrangement_ok", "location_ok"].includes(key) && (yes || no)) Object.assign(fit, { [key]: yes });
    else if (key === "seniority" && ["match", "stretch", "over"].includes(value)) fit.seniority = value as Fit["seniority"];
    else throw new Error(`fit spec: cannot read "${pair}" (use must_haves=3/7 preferred=1/3 pay_ok=yes arrangement_ok=yes location_ok=yes seniority=match|stretch|over)`);
  }
  return fit;
}

/** The bar a posting's score must reach: what the setting is, and where it came from. */
export type Minimum = { value: number; source: string };

/**
 * The share of a posting's must-haves the person must meet: a share stated in their `prefs.min-fit` answer
 * ("65, must-haves 40%"), else `score.must_haves_minimum` from the pipeline config, which is only a default.
 */
export function mustHaveMinimum(person: string, root = repoRoot(), config: PipelineConfig = loadPipelineConfig(root)): Minimum {
  for (const [source, path] of [["session answer", sessionAnswersPath(person, root)], ["saved answer", savedAnswersPath(person, root)]] as const) {
    const answer = loadAnswers(path).get("prefs.min-fit")?.answer;
    const m = answer?.match(/must[- ]?haves?\D{0,20}?(\d+(?:\.\d+)?)\s*(%?)/i);
    if (m) {
      const n = Number(m[1]);
      return { value: m[2] || n > 1 ? Math.min(1, n / 100) : n, source };
    }
  }
  return { value: config.score.must_haves_minimum, source: "pipeline default" };
}

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
