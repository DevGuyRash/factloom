import { flag, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import type { ApplicationStatus } from "../lib/schema.ts";
import { normalizeAt } from "../lib/when.ts";

const OUTCOMES: readonly ApplicationStatus[] = ["rejected", "interviewing", "offer", "withdrawn", "closed"];

/**
 * Records a later outcome on an application: updates status + updated, and appends a dated history line to the record
 * body. An interview is kept as a datetime with its UTC offset in the record's `interviews`, where `status` finds it
 * for reminders: --at adds one, --replaces moves one, --cancel removes one.
 */
const command: Command = {
  name: "outcome",
  summary: "Record a later outcome: rejected, interviewing, offer, withdrawn, or closed",
  usage: "resumes outcome <dir> rejected|interviewing|offer|withdrawn|closed [--note TEXT] [--person p]\n       resumes outcome <dir> interviewing --at <datetime with offset> [--replaces <datetime>] [--note TEXT]   (e.g. --at 2026-10-12T14:00-07:00)\n       resumes outcome <dir> interviewing --cancel <datetime> [--note TEXT]",
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
    const [atArg, replacesArg, cancelArg] = [flag(a, "at"), flag(a, "replaces"), flag(a, "cancel")];
    if ((atArg || replacesArg || cancelArg) && status !== "interviewing") throw new Error("--at, --replaces, and --cancel go with interviewing");
    const moment = (label: string, value: string) => {
      const m = normalizeAt(value);
      if (!m) throw new Error(`${label} takes a date and time with its UTC offset, such as 2026-10-12T14:00-07:00 (an offset is never guessed): ${value}`);
      return m;
    };
    let interviews = Array.isArray(data.interviews) ? data.interviews.map(String) : [];
    const without = (value: string, label: string) => {
      const m = moment(label, value);
      const kept = interviews.filter((x) => Date.parse(x) !== m.ms);
      if (kept.length === interviews.length) throw new Error(`${label}: no interview at ${value} on this application (${interviews.join(", ") || "none recorded"})`);
      interviews = kept;
    };
    if (replacesArg && !atArg) throw new Error("--replaces needs --at, the new time");
    if (cancelArg) without(cancelArg, "--cancel");
    if (replacesArg) without(replacesArg, "--replaces");
    const at = atArg ? moment("--at", atArg) : null;
    if (at && !interviews.some((x) => Date.parse(x) === at.ms)) interviews.push(at.text);
    interviews.sort((x, y) => Date.parse(x) - Date.parse(y));
    if (interviews.length) data.interviews = interviews; else delete data.interviews;
    const detail = [at ? `interview ${at.text}` : "", replacesArg ? `moved from ${replacesArg}` : "", cancelArg ? `interview ${cancelArg} cancelled` : ""].filter(Boolean).join(", ");
    const line = `- ${today()}: ${status}${detail ? ` (${detail})` : ""}${note ? ` — ${note}` : ""}\n`;
    writeDoc(app.recordPath!, data, `${body.trimEnd()}\n\n${line}`);
    console.log(`${rel(app.dir)}: ${status}`);
    return 0;
  },
};
export default command;
