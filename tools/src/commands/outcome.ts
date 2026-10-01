import { flag, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import type { ApplicationStatus } from "../lib/schema.ts";

const OUTCOMES: readonly ApplicationStatus[] = ["rejected", "interviewing", "offer", "withdrawn", "closed"];

/** Records a later outcome on an application: updates status + updated, and appends a dated history line to the record body. */
const command: Command = {
  name: "outcome",
  summary: "Record a later outcome: rejected, interviewing, offer, withdrawn, or closed",
  usage: "resumes outcome <dir> rejected|interviewing|offer|withdrawn|closed [--note TEXT] [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const [dirArg, status] = a._;
    if (!dirArg || !status) throw new Error("outcome needs <dir> and a status");
    if (!OUTCOMES.includes(status as ApplicationStatus)) throw new Error(`status must be one of ${OUTCOMES.join(", ")}`);
    const app = listApplications(person).find((x) => x.dir === dirArg || x.name === dirArg || rel(x.dir) === dirArg);
    if (!app) throw new Error(`no application matches ${dirArg}`);
    const { data, body } = loadRecord(app);
    data.status = status as ApplicationStatus;
    data.updated = today();
    const note = flag(a, "note");
    const line = `- ${today()}: ${status}${note ? ` — ${note}` : ""}\n`;
    writeDoc(app.recordPath!, data, `${body.trimEnd()}\n\n${line}`);
    console.log(`${rel(app.dir)}: ${status}`);
    return 0;
  },
};
export default command;
