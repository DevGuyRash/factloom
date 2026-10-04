import { flag, has, parseArgs } from "../lib/args.ts";
import { findApplication, listApplications, loadRecord, type Application } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { updateFor } from "../lib/queue.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { computeScore, describeParts, minimumScore, mustHaveMinimum, parseFitSpec, scoreParts, type Fit, type Minimum } from "../lib/scoring.ts";

/**
 * The score with its verdict: no verdict without must-haves recorded; below the must-have share, or below the
 * person's minimum, it says skip, naming where each bar came from (the person's answer, or a pipeline default).
 */
export function verdict(score: number, min: Minimum, fit: Fit, mustHaves: Minimum | number = loadPipelineConfig().score.must_haves_minimum): string {
  const share = typeof mustHaves === "number" ? { value: mustHaves, source: "pipeline default" } : mustHaves;
  if (!fit.must_haves_total) return `${score} (no verdict: record fit.must_haves_met and fit.must_haves_total, then score again)`;
  const met = fit.must_haves_met ?? 0;
  if (met / fit.must_haves_total < share.value) {
    return `${score} (meets ${met} of ${fit.must_haves_total} must-haves, under ${Math.round(share.value * 100)}% from the ${share.source}: skip, with that as the reason)`;
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
  updateFor(person, data, { score });
  return { score, fit };
}

const command: Command = {
  name: "score",
  summary: "Compute a 0-100 fit score from a record's fit: map and check it against the person's minimum",
  usage: 'resumes score <dir> [--fit "must_haves=3/7 pay_ok=yes seniority=match preferred=1/3"] [--resume <variant>] [--person p]\n       resumes score --all [--person p]\n       resumes score --fit "<fit spec>" [--person p]',
  run(argv) {
    const a = parseArgs(argv, ["all"]);
    const person = resolvePerson(flag(a, "person"));
    const apps = listApplications(person);
    const min = minimumScore(person);
    const share = mustHaveMinimum(person);
    const show = (label: string, score: number, fit: Fit) => console.log(`${label}${verdict(score, min, fit, share)}\n  points: ${describeParts(scoreParts(fit))}`);

    // Screening from a listing card or posting before it has a record: nothing is written.
    const spec = flag(a, "fit");
    if (spec !== undefined && !a._[0]) {
      const fit = parseFitSpec(spec);
      show("", computeScore(fit), fit);
      return 0;
    }

    if (has(a, "all")) {
      let scored = 0;
      for (const app of apps) {
        const s = scoreOne(person, app);
        if (s !== null) {
          show(`${rel(app.dir)}: `, s.score, s.fit);
          scored++;
        }
      }
      console.log(`scored ${scored} of ${apps.length}`);
      return 0;
    }

    const dirArg = a._[0];
    if (!dirArg) throw new Error("score needs <dir> or --all");
    const app = findApplication(person, dirArg);
    // --fit and --resume write the record's fit map and chosen resume, so nobody edits its YAML by hand.
    const resume = flag(a, "resume");
    if (spec !== undefined || resume) {
      const { data, body } = loadRecord(app);
      const record = data as Record<string, unknown>;
      if (spec !== undefined) record.fit = { ...((record.fit as Fit | undefined) ?? {}), ...parseFitSpec(spec) };
      if (resume) record.resume = resume;
      writeDoc(app.recordPath!, record, body);
    }
    const s = scoreOne(person, findApplication(person, app.name));
    if (s === null) {
      console.error(`${rel(app.dir)}: no fit: map in the record`);
      return 1;
    }
    show(`${rel(app.dir)}: `, s.score, s.fit);
    return 0;
  },
};
export default command;
