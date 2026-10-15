import { flag, has, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { APPLICATION_LABEL, OUTCOME_STATUS, OUTCOME_FEEDBACK_RECONCILIATION, type ApplicationStatus, type OutcomeFeedback } from "../lib/schema.ts";
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
    "resumes outcome <dir> <status> --feedback generic|visibility|specific [--feedback-text TEXT --source TEXT] [--evidence-ref TEXT] [--on <date|datetime>] [--person p]",
  ].join("\n       "),
  run(argv) {
    const a = parseArgs(argv, ["custom"]);
    const person = resolvePerson(flag(a, "person"));
    const [dirArg, status] = a._;
    if (!dirArg || !status) throw new Error("outcome needs <dir> and a status");
    if (!OUTCOMES.includes(status) && !(has(a, "custom") && APPLICATION_LABEL.test(status) && !["drafted", "blocked", "submitted", "skipped"].includes(status))) throw new Error(`status must be one of ${OUTCOMES.join(", ")}, or an explicit lowercase hyphenated custom status with --custom; use app for draft/hold/submit/skip`);
    // Classifications are explicit caller input, never inferred from rejection text or keyword overlap.
    // Keep the original reference for later evidence recovery; intake does not verify it or edit resumes.
    for (const field of ["feedback", "feedback-text", "source", "evidence-ref"]) {
      if (has(a, field) && !flag(a, field)?.trim()) throw new Error(`--${field} needs text`);
    }
    const feedbackKind = flag(a, "feedback") ?? (["rejected", "not-hired"].includes(status) ? "generic" : undefined);
    if (feedbackKind && !Object.hasOwn(OUTCOME_FEEDBACK_RECONCILIATION, feedbackKind)) throw new Error("--feedback must be generic, visibility, or specific");
    if (!has(a, "feedback") && (has(a, "feedback-text") || has(a, "evidence-ref"))) throw new Error("--feedback-text and --evidence-ref need an explicit --feedback classification");
    if (has(a, "source") && !feedbackKind) throw new Error("--source needs --feedback");
    const feedbackText = flag(a, "feedback-text")?.trim();
    const feedbackSource = flag(a, "source")?.trim();
    if ((feedbackKind === "visibility" || feedbackKind === "specific") && (!feedbackText || !feedbackSource)) throw new Error("visibility and specific feedback need --feedback-text and --source (the original message or observation reference)");
    if (feedbackText && !feedbackSource) throw new Error("--feedback-text needs --source so the statement remains attributable");
    const evidenceRefs = flag(a, "evidence-ref")?.split(";").map((ref) => ref.trim()).filter(Boolean);
    if (has(a, "evidence-ref") && !evidenceRefs?.length) throw new Error("--evidence-ref needs an original-source pointer (separate several with semicolons)");
    const feedback: OutcomeFeedback | undefined = feedbackKind ? {
      kind: feedbackKind as OutcomeFeedback["kind"], cause: "unknown",
      reconciliation: OUTCOME_FEEDBACK_RECONCILIATION[feedbackKind as OutcomeFeedback["kind"]],
      ...(feedbackText ? { text: feedbackText } : {}), ...(feedbackSource ? { source: feedbackSource } : {}),
      ...(evidenceRefs ? { evidence_refs: evidenceRefs } : {}),
    } : undefined;
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
    appendEvent(data, { kind, on, status, ...(note ? { note } : {}), ...(at ? { at: at.text } : {}), ...(cancelArg ? { at: moment("--cancel", cancelArg).text } : {}), ...(replacesArg ? { replaces: moment("--replaces", replacesArg).text } : {}), ...(round ? { round } : {}), ...(feedback ? { feedback } : {}) });
    if (start) appendEvent(data, { kind: "start-scheduled", on, start_date: start });
    const feedbackDetail = feedback ? `; feedback ${feedback.kind}, cause unknown, reconciliation ${feedback.reconciliation}${feedback.text ? `; ${feedback.text}` : ""}${feedback.source ? `; source: ${feedback.source}` : ""}${feedback.evidence_refs?.length ? `; supplied evidence: ${feedback.evidence_refs.join("; ")}` : ""}` : "";
    const line = `- ${on}: ${status}${detail ? ` (${detail})` : ""}${start ? ` (start ${start})` : ""}${note ? ` — ${note}` : ""}${feedbackDetail}\n`;
    writeDoc(app.recordPath!, data, `${body.trimEnd()}\n\n${line}`);
    console.log(`${rel(app.dir)}: ${status}`);
    if (feedback) {
      console.log(`Feedback: ${feedback.kind}; cause unknown.`);
      if (feedback.kind === "generic") console.log("No resume change required from this outcome alone; retain the outcome for bounded resume-reconciliation when useful.");
      else if (feedback.kind === "visibility") console.log("Use resume-reconciliation to recover supported evidence from original evidence and later explicit confirmations, compare it with the exact sent artifact (or retain unknown identity), and update only the narrowest appropriate source if justified.");
      else console.log("Use resume-reconciliation to compare the attributed feedback, role requirements and original evidence; no automatic resume change or hiring-causality claim.");
      if (feedback.source) console.log(`Supplied feedback source (not independently verified): ${feedback.source}`);
      if (feedback.evidence_refs?.length) console.log(`Supplied evidence pointers (not independently verified): ${feedback.evidence_refs.join("; ")}`);
    }
    return 0;
  },
};
export default command;
