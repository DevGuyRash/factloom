import { flag, has, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { APPLICATION_LABEL, OUTCOME_STATUS, type ApplicationStatus } from "../lib/schema.ts";
import { appendEvent, calendarDate, onFromArgs } from "../lib/application-history.ts";
import { normalizeAt } from "../lib/when.ts";

const OUTCOMES: readonly ApplicationStatus[] = OUTCOME_STATUS;

/**
 * Records a later outcome on an application: updates status + updated, and appends a dated history line to the record
 * body. An interview is kept as a datetime with its UTC offset in the record's `interviews`, where `status` finds it
 * for reminders: --at adds one, --replaces moves one, --cancel removes one.
 */
const command: Command = {
  name: "outcome",
  summary: "Record dated outcomes, interviews, hiring/start dates, or an explicit custom status",
  usage: [
    `resumes outcome <dir> ${OUTCOME_STATUS.join("|")} [--on <date|datetime>] [--note TEXT] [--person p]`,
    "resumes outcome <dir> <status> --custom [--on <date|datetime>] [--note TEXT] [--person p]",
    "resumes outcome <dir> interviewing --at <datetime> [--replaces <datetime>] [--on <date|datetime>] [--round TEXT] [--note TEXT] [--person p]",
    "resumes outcome <dir> interviewing --cancel <datetime> [--on <date|datetime>] [--note TEXT] [--person p]",
    "resumes outcome <dir> hired [--on <date>] [--start <date>] [--note TEXT] [--person p]",
  ].join("\n       "),
  run(argv) {
    const a = parseArgs(argv, ["custom"]);
    const person = resolvePerson(flag(a, "person"));
    const [dirArg, status] = a._;
    if (!dirArg || !status) throw new Error("outcome needs <dir> and a status");
    if (!OUTCOMES.includes(status) && !(has(a, "custom") && APPLICATION_LABEL.test(status) && !["drafted", "blocked", "submitted", "skipped"].includes(status))) throw new Error(`status must be one of ${OUTCOMES.join(", ")}, or an explicit lowercase hyphenated custom status with --custom; use app for draft/hold/submit/skip`);
    const on = onFromArgs(a);
    const start = flag(a, "start");
    if (has(a, "start") && (status !== "hired" || !start || !calendarDate(start))) throw new Error("--start goes with hired and takes a real YYYY-MM-DD date");
    const app = listApplications(person).find((x) => x.dir === dirArg || x.name === dirArg || rel(x.dir) === dirArg);
    if (!app) throw new Error(`no application matches ${dirArg}`);
    const { data, body } = loadRecord(app);
    if (!OUTCOMES.includes(status)) {
      if (data.custom_statuses != null && !Array.isArray(data.custom_statuses)) throw new Error("custom_statuses must be a list; repair the record before updating it");
      data.custom_statuses = [...new Set([...(data.custom_statuses ?? []), status])];
    }
    data.status = status as ApplicationStatus;
    data.updated = today();
    const note = flag(a, "note");
    const [atArg, replacesArg, cancelArg] = [flag(a, "at"), flag(a, "replaces"), flag(a, "cancel")];
    if ((atArg || replacesArg || cancelArg) && status !== "interviewing") throw new Error("--at, --replaces, and --cancel go with interviewing");
    const moment = (label: string, value: string) => {
      const m = normalizeAt(value);
      if (!m || !calendarDate(m.text.slice(0, 10))) throw new Error(`${label} takes a date and time with its UTC offset, such as 2026-10-12T14:00-07:00 (an offset is never guessed): ${value}`);
      return m;
    };
    if (cancelArg && (atArg || replacesArg)) throw new Error("--cancel cannot be combined with --at or --replaces");
    for (const field of ["at", "replaces", "cancel"]) if (has(a, field) && !flag(a, field)) throw new Error(`--${field} needs a datetime`);
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
    const kind = cancelArg ? "interview-cancelled" : replacesArg ? "interview-rescheduled" : at ? "interview-scheduled" : status;
    const round = flag(a, "round");
    if (round && !at) throw new Error("--round needs interviewing --at");
    if (status === "hired") data.hired = on.slice(0, 10);
    if (start) data.start_date = start;
    if (status === "started") data.started = on.slice(0, 10);
    appendEvent(data, { kind, on, status, ...(note ? { note } : {}), ...(at ? { at: at.text } : {}), ...(cancelArg ? { at: moment("--cancel", cancelArg).text } : {}), ...(replacesArg ? { replaces: moment("--replaces", replacesArg).text } : {}), ...(round ? { round } : {}) });
    if (start) appendEvent(data, { kind: "start-scheduled", on, start_date: start });
    const line = `- ${on}: ${status}${detail ? ` (${detail})` : ""}${start ? ` (start ${start})` : ""}${note ? ` — ${note}` : ""}\n`;
    writeDoc(app.recordPath!, data, `${body.trimEnd()}\n\n${line}`);
    console.log(`${rel(app.dir)}: ${status}`);
    return 0;
  },
};
export default command;
