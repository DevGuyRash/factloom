import { flag, has, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord, type Application } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { loadQueue, saveQueue } from "../lib/queue.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { computeScore, minimumScore, type Fit, type Minimum } from "../lib/scoring.ts";
import { normalizeUrl } from "../lib/text.ts";

/**
 * The score with its verdict: no verdict without must-haves recorded, skip when fewer than the configured
 * share of must-haves are met, else skip or apply by the person's minimum.
 */
export function verdict(score: number, min: Minimum, fit: Fit, mustHavesMinimum = loadPipelineConfig().score.must_haves_minimum): string {
  if (!fit.must_haves_total) return `${score} (no verdict: record fit.must_haves_met and fit.must_haves_total, then score again)`;
  const met = fit.must_haves_met ?? 0;
  if (met / fit.must_haves_total < mustHavesMinimum) {
    return `${score} (meets ${met} of ${fit.must_haves_total} must-haves, under ${Math.round(mustHavesMinimum * 100)}%: skip, with that as the reason)`;
  }
  const bar = score >= min.value ? `clears the minimum of ${min.value}` : `below the minimum of ${min.value}: skip, with the score as the reason`;
  return `${score} (${bar}; minimum from the ${min.source})`;
}

/** Scores one application (or all) from its record's `fit:` map; writes `score` to the record and, when queued, to the queue item too. */
function scoreOne(person: string, app: Application): { score: number; fit: Fit } | null {
  const { data, body } = loadRecord(app);
  const fit = (data as Record<string, unknown>).fit as Fit | undefined;
  if (!fit) return null;
  const score = computeScore(fit);
  data.score = score;
  data.updated = today();
  writeDoc(app.recordPath!, data, body);
  if (data.url) {
    const { items } = loadQueue(person);
    const key = normalizeUrl(String(data.url));
    const i = items.findIndex((q) => normalizeUrl(q.url) === key);
    if (i >= 0) {
      items[i] = { ...items[i], score };
      saveQueue(person, items);
    }
  }
  return { score, fit };
}

const command: Command = {
  name: "score",
  summary: "Compute a 0-100 fit score from a record's fit: map and check it against the person's minimum",
  usage: "resumes score <dir> [--person p]\n       resumes score --all [--person p]",
  run(argv) {
    const a = parseArgs(argv, ["all"]);
    const person = resolvePerson(flag(a, "person"));
    const apps = listApplications(person);
    const min = minimumScore(person);

    if (has(a, "all")) {
      let scored = 0;
      for (const app of apps) {
        const s = scoreOne(person, app);
        if (s !== null) {
          console.log(`${rel(app.dir)}: ${verdict(s.score, min, s.fit)}`);
          scored++;
        }
      }
      console.log(`scored ${scored} of ${apps.length}`);
      return 0;
    }

    const dirArg = a._[0];
    if (!dirArg) throw new Error("score needs <dir> or --all");
    const app = apps.find((x) => x.dir === dirArg || x.name === dirArg || rel(x.dir) === dirArg);
    if (!app) throw new Error(`no application matches ${dirArg}`);
    const s = scoreOne(person, app);
    if (s === null) {
      console.error(`${rel(app.dir)}: no fit: map in the record`);
      return 1;
    }
    console.log(`${rel(app.dir)}: ${verdict(s.score, min, s.fit)}`);
    return 0;
  },
};
export default command;
