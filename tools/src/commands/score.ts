import { flag, has, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord, type Application } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { loadQueue, saveQueue } from "../lib/queue.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { computeScore, type Fit } from "../lib/scoring.ts";
import { normalizeUrl } from "../lib/text.ts";

/** Scores one application (or all) from its record's `fit:` map; writes `score` to the record and, when queued, to the queue item too. */
function scoreOne(person: string, app: Application): number | null {
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
  return score;
}

const command: Command = {
  name: "score",
  summary: "Compute a 0-100 fit score from a record's fit: map",
  usage: "resumes score <dir> [--person p]\n       resumes score --all [--person p]",
  run(argv) {
    const a = parseArgs(argv, ["all"]);
    const person = resolvePerson(flag(a, "person"));
    const apps = listApplications(person);

    if (has(a, "all")) {
      let scored = 0;
      for (const app of apps) {
        const s = scoreOne(person, app);
        if (s !== null) {
          console.log(`${rel(app.dir)}: ${s}`);
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
    console.log(`${rel(app.dir)}: ${s}`);
    return 0;
  },
};
export default command;
