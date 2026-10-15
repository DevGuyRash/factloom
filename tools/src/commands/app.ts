import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { flag, has, parseArgs } from "../lib/args.ts";
import { createApplication, describeApplication, findApplication, findDuplicate, loadRecord, type Application } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { findEmployer } from "../lib/employers.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { updateFor } from "../lib/queue.ts";
import { rel, repoRoot, resolvePerson, stamp, today } from "../lib/repo.ts";
import { logEvent } from "../lib/runlog.ts";
import { appendEvent, DETAILS_USAGE, detailsFromArgs, eventDate, onFromArgs } from "../lib/application-history.ts";
import { requireScamClear } from "../lib/scam.ts";
import { wasSent } from "../lib/stats.ts";
import { normalizeAt } from "../lib/when.ts";
import { DATE, APPLICATION_EVENT_KINDS, OUTCOME_STATUS, type ApplicationEvent } from "../lib/schema.ts";
import { parseWhen } from "../lib/when.ts";
import { associateSubmissionArtifact, freezeSubmissionArtifact, lockArtifact, validateApplication } from "../lib/tailored-artifact.ts";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

/** Appends a dated line to a record's body, applying a frontmatter patch (a key set to undefined is removed). */
function note(app: Application, line: string, patch: Record<string, unknown> = {}, event: Partial<ApplicationEvent> = {}, answersFile?: string) {
  const { data, body } = loadRecord(app);
  const answeredBody = withAnswers(body, answersFile);
  const next = Object.fromEntries(Object.entries({ ...data, ...patch, updated: today() }).filter(([, v]) => v !== undefined));
  appendEvent(data, { kind: "note", on: today(), note: line, ...event });
  writeDoc(app.recordPath!, { ...next, events: data.events }, `${answeredBody.trimEnd()}\n\n- ${event.on ?? today()}: ${line}\n`);
}

/**
 * Adds the answers given on the form (one line each: the question, the answer, its source) under the record's
 * "Answers given" heading, so they are written once, by the command, not edited into the record by hand.
 */
function withAnswers(body: string, file: string | undefined): string {
  if (file === undefined) return body;
  const lines = readFileSync(file === "-" ? 0 : file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith("- ") ? l : `- ${l}`));
  if (!lines.length) return body;
  const heading = /^## Answers given\s*$/m;
  return heading.test(body)
    ? body.replace(/(^## Answers given\s*\n(?:(?!^## ).*\n?)*)/m, (section) => `${section.trimEnd()}\n${lines.join("\n")}\n\n`)
    : `${body.trimEnd()}\n\n## Answers given\n\n${lines.join("\n")}\n`;
}


/** Kinds of hold, so the waiting list groups what the person must do and retries know what to look for. */
const HOLD_KINDS = ["answer", "person-step", "account", "captcha", "upload", "site", "confirmation", "other"] as const;

const label = (app: Application) => `${app.record?.company ?? "?"} — ${app.record?.role ?? "?"}`;

/**
 * `app new` creates an application, refusing blocked employers and the same job twice, and showing a possible
 * duplicate for the agent to judge. `submitting` marks the moment before the final click; `submit`, `hold`, `skip`,
 * and `reopen` update the record, its queue entry, and the run log (unless --no-log); `note` adds a dated line,
 * so records are never edited by hand. A hold can carry a due time (an assessment that expires, a link that lapses),
 * which `status` surfaces; `resolve` closes the pending step of a sent application when it is done.
 */
const command: Command = {
  name: "app",
  summary: "Record applications, employer details, contacts, milestones, and notes",
  usage: [
    "resumes app new --company <name> --role <title> [--url U] [--source S] [--site Z] [--requisition R] [--posted YYYY-MM-DD] [--closes YYYY-MM-DD] [--posting-file <file|->] [--location L] [--arrangement A] [--pay-min N] [--pay-max N] [--pay-period hour|year] [--distinct-from <dir> --because TEXT] [--person p] " + DETAILS_USAGE,
    "resumes app submitting <dir> [--artifact <uploaded-docx-or-pdf>] [--person p]",
    "resumes app submit <dir> [--confirmation TEXT] [--proof <file>] [--answers <file|->] [--follow-up <days|YYYY-MM-DD>] [--on <date>] [--no-log] [--person p]",
    "resumes app hold <dir> --reason TEXT [--kind answer|person-step|account|captcha|upload|site|confirmation|other] [--waits <catalog-id>] [--due <YYYY-MM-DD|datetime with offset>] [--answers <file|->] [--no-log] [--person p]",
    "resumes app resolve <dir> [--note TEXT] [--no-log] [--person p]",
    "resumes app skip <dir> --reason TEXT [--rule <catalog-id>] [--no-log] [--person p]",
    "resumes app reopen <dir> --reason TEXT [--person p]",
    'resumes app note <dir> "<text>" [--on <date|datetime>] [--person p]',
    "resumes app details <dir> " + DETAILS_USAGE + " [--note TEXT] [--person p]",
    "resumes app event <dir> <kind> [--on <date|datetime>] [--at <datetime>] [--round TEXT] [--contact-method TEXT] [--note TEXT] [--person p]",
    "resumes app history <dir> [--format text|json] [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest, ["no-log"]);
    const person = resolvePerson(flag(a, "person"));
    const log = (kind: "applied" | "held" | "skipped" | "note", message: string) => {
      if (!has(a, "no-log")) logEvent(person, kind, message);
    };
    const number = (name: string) => {
      const v = flag(a, name);
      if (v === undefined) return undefined;
      const n = Number(v.replace(/[,$]/g, ""));
      if (!Number.isFinite(n)) throw new Error(`--${name} takes a number`);
      return n;
    };

    if (sub === "new") {
      const company = flag(a, "company");
      const role = flag(a, "role");
      if (!company || !role) throw new Error("app new needs --company and --role");
      const employer = findEmployer(person, company);
      if (employer?.blocked) {
        console.error(`${company} is blocked (employers list entry "${employer.company}"${employer.reason ? `: ${employer.reason}` : ""})`);
        return 1;
      }
      // The posting text goes from the page to a file to here, without passing through a conversation.
      const postingFile = flag(a, "posting-file");
      const description = postingFile === undefined ? undefined : readFileSync(postingFile === "-" ? 0 : postingFile, "utf8").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
      const job = { company, role, url: flag(a, "url"), source: flag(a, "source"), requisition: flag(a, "requisition") };
      const dup = findDuplicate(person, { ...job, description });
      const distinctFrom = flag(a, "distinct-from"), because = flag(a, "because");
      if (dup && (dup.by === "link" || dup.by === "requisition")) {
        console.error(`already applied for: ${rel(dup.app.dir)} has the same ${dup.by} (${describeApplication(dup.app)})`);
        return 1;
      }
      if (dup) {
        const named = distinctFrom && [dup.app.dir, dup.app.name, rel(dup.app.dir)].includes(distinctFrom);
        if (!named || !because) {
          console.error(
            `possible duplicate of ${rel(dup.app.dir)}: ${describeApplication(dup.app)}; ${dup.by === "text" ? "posting text" : "title"} similarity ${dup.similarity}.\n` +
              (dup.by === "text" ? "Nearly the same posting text usually means one client's role posted by several staffing firms: apply through one route, and skip the other as a repost. " : "") +
              `Compare the postings. If this is a different job, run again with --distinct-from ${dup.app.name} --because "<what differs: team, level, location, requisition, client>".`,
          );
          return 1;
        }
      }
      const posted = flag(a, "posted");
      if (posted && !DATE.test(posted)) throw new Error("--posted takes YYYY-MM-DD");
      const closes = flag(a, "closes");
      if (closes && !DATE.test(closes)) throw new Error("--closes takes YYYY-MM-DD, the last day the posting accepts applications");
      const details = detailsFromArgs(a);
      const app = createApplication(person, {
        ...job, ...details, site: flag(a, "site"), posted, description, location: flag(a, "location"), arrangement: flag(a, "arrangement"),
        pay_min: number("pay-min"), pay_max: number("pay-max"), pay_period: flag(a, "pay-period"),
      }, undefined, { distinct: true });
      if (dup) {
        note(app, `a different job from ${dup.app.name}: ${because}`);
        note(dup.app, `${app.name} is a different job: ${because}`);
      }
      if (closes) {
        const { data, body } = loadRecord(app);
        writeDoc(app.recordPath!, { ...data, closes }, body);
      }
      updateFor(person, { url: job.url, source: job.source }, { status: "in-progress", ...(closes ? { closes } : {}) });
      console.log(rel(app.dir));
      return 0;
    }

    if (sub === "submitting") {
      // Written just before the final click: if the run stops between the click and `app submit` (a crash, a
      // context compaction), `status` says to check the site for a confirmation instead of sending it again.
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app submitting needs <dir>");
      const app = findApplication(person, dirArg);
      const { data, body } = loadRecord(app);
      validateApplication(app.dir, person, repoRoot());
      if (data.person !== person) throw new Error("application record owner does not match this person");
      requireScamClear(data, "Marking a submit click");
      if (wasSent(data)) throw new Error("this application already has sent history; never record another submit click");
      if (has(a, "artifact") && flag(a, "artifact") === undefined) throw new Error("--artifact needs the selected uploaded DOCX/PDF file");
      const release = lockArtifact(app.dir);
      try {
        const submission_artifact = freezeSubmissionArtifact(app.dir, data, flag(a, "artifact"));
        writeDoc(app.recordPath!, { ...data, submission_artifact, submit_clicked: data.submit_clicked ?? stamp(), updated: today() }, body);
      } finally { release(); }
      log("note", `submitting ${label(app)}`);
      console.log(`${rel(app.dir)}: submit marked; run app submit as soon as the site confirms`);
      return 0;
    }

    if (sub === "submit") {
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app submit needs <dir>");
      const app = findApplication(person, dirArg);
      const { data, body } = loadRecord(app);
      validateApplication(app.dir, person, repoRoot());
      if (data.person !== person) throw new Error("application record owner does not match this person");
      requireScamClear(data, "Recording a submission");
      const applied = onFromArgs(a);
      if (!DATE.test(applied)) throw new Error("app submit --on takes YYYY-MM-DD");
      if (data.applied) throw new Error(`already submitted on ${data.applied}; use app note or outcome, never submit twice`);
      // Read all caller-supplied inputs before copying proof or changing the durable record. A missing
      // answers file must leave this unsent record retriable, including its queue and run-log state.
      for (const field of ["answers", "proof", "follow-up", "confirmation"]) {
        if (has(a, field) && flag(a, field) === undefined) throw new Error(`--${field} needs a value`);
      }
      const answeredBody = withAnswers(body, flag(a, "answers"));
      const cfg = loadPipelineConfig();
      // The pipeline's follow_up_days is the default; a posting that states its own timeline can set another.
      const followUp = flag(a, "follow-up");
      if (followUp && !DATE.test(followUp) && !/^\d+$/.test(followUp)) throw new Error("--follow-up takes a number of days or a YYYY-MM-DD date");
      const confirmation = flag(a, "confirmation");
      const proof = flag(a, "proof");
      if (proof && !existsSync(proof)) throw new Error(`${proof} does not exist`);
      const releaseArtifact = lockArtifact(app.dir);
      try {
        const submission_artifact = associateSubmissionArtifact(app.dir, data, applied);
        data.status = "submitted";
        data.submission_artifact = submission_artifact;
        data.applied = applied;
        if (!data.date_contacted || applied < data.date_contacted) data.date_contacted = applied;
        data.follow_up = followUp && DATE.test(followUp) ? followUp : addDays(applied, followUp ? Number(followUp) : cfg.follow_up_days);
        data.updated = today();
        delete data.submit_clicked;
        delete data.due;
        if (confirmation) data.confirmation = confirmation;
        appendEvent(data, { kind: "submitted", on: applied, status: "submitted", ...(confirmation ? { note: confirmation } : {}) });
        if (proof) {
          if (!existsSync(proof)) throw new Error(`${proof} does not exist`);
          const destName = `confirmation${extname(proof) || ".txt"}`;
          if (join(app.dir, destName) !== proof) copyFileSync(proof, join(app.dir, destName));
          data.proof = destName;
          if (!data.confirmation) data.confirmation = destName;
        }
        writeDoc(app.recordPath!, data, answeredBody);
      } finally { releaseArtifact(); }
      updateFor(person, data, { status: "done", outcome: "submitted", application: app.name });
      log("applied", `${label(app)}${confirmation ? ` (${confirmation})` : ""}`);
      console.log(`submitted ${rel(app.dir)} (follow up ${data.follow_up})${proof ? `; proof saved as ${data.proof}` : ""}`);
      return 0;
    }

    if (sub === "hold") {
      const dirArg = a._[0];
      const reason = flag(a, "reason");
      if (!dirArg || !reason) throw new Error("app hold needs <dir> --reason TEXT");
      const kind = flag(a, "kind");
      if (kind && !(HOLD_KINDS as readonly string[]).includes(kind)) throw new Error(`--kind is one of ${HOLD_KINDS.join(", ")}`);
      const waits = flag(a, "waits");
      const dueArg = flag(a, "due");
      const due = dueArg === undefined ? undefined : parseWhen(dueArg)?.text;
      if (dueArg !== undefined && !due) throw new Error("--due takes YYYY-MM-DD, or a date and time with its UTC offset such as 2026-10-12T14:00-07:00");
      const app = findApplication(person, dirArg);
      if (has(a, "answers") && flag(a, "answers") === undefined) throw new Error("--answers needs a file or -");
      const answersFile = flag(a, "answers");
      const record = loadRecord(app).data;
      const status = record.status;
      if (wasSent(record)) {
        // Sent, with a step still to come (an assessment, an account at the employer): it stays submitted, and keeps
        // what the step waits on, so an answer that settles it points back here.
        note(app, `pending — ${reason}${due ? ` (due ${due})` : ""}`, { pending: reason, pending_kind: kind, pending_waits_on: waits, due }, {}, answersFile);
        log("note", `${label(app)}: sent, pending ${reason}${due ? ` (due ${due})` : ""}`);
        console.log(`${rel(app.dir)} stays ${status}; pending: ${reason}${due ? ` (due ${due})` : ""}`);
        return 0;
      }
      note(app, `held — ${reason}${due ? ` (due ${due})` : ""}`, { status: "blocked", hold_kind: kind, waits_on: waits, due }, { kind: "held", status: "blocked" }, answersFile);
      // The record now carries the posting; its queue entry is done, so it does not come back from `queue next`.
      updateFor(person, loadRecord(app).data, { status: "done", outcome: "held", note: reason, application: app.name });
      log("held", `${label(app)}: ${reason}${due ? ` (due ${due})` : ""}`);
      console.log(`held ${rel(app.dir)}: ${reason}${due ? ` (due ${due})` : ""}`);
      return 0;
    }

    if (sub === "skip") {
      const dirArg = a._[0];
      const reason = flag(a, "reason");
      if (!dirArg || !reason) throw new Error("app skip needs <dir> --reason TEXT");
      const app = findApplication(person, dirArg);
      const rule = flag(a, "rule");
      note(app, `skipped — ${reason}`, { status: "skipped", skip_rule: rule }, { kind: "skipped", status: "skipped" });
      updateFor(person, loadRecord(app).data, { status: "done", outcome: "skipped", note: reason, application: app.name, ...(rule ? { rule } : {}) });
      log("skipped", `${label(app)}: ${reason}`);
      console.log(`skipped ${rel(app.dir)}: ${reason}`);
      return 0;
    }

    if (sub === "reopen") {
      // A skipped or held application comes back when what ruled it out changed (a constraint relaxed, a blocker cleared).
      const dirArg = a._[0];
      const reason = flag(a, "reason");
      if (!dirArg || !reason) throw new Error("app reopen needs <dir> --reason TEXT");
      const app = findApplication(person, dirArg);
      requireScamClear(loadRecord(app).data, "Reopening an application");
      const status = loadRecord(app).data.status;
      if (status !== "skipped" && status !== "blocked") throw new Error(`${rel(app.dir)} is ${status}; only skipped or held applications reopen`);
      note(app, `reopened — ${reason}`, { status: "drafted", hold_kind: undefined, waits_on: undefined, skip_rule: undefined, due: undefined }, { kind: "reopened", status: "drafted" });
      console.log(`reopened ${rel(app.dir)}: ${reason}`);
      return 0;
    }

    if (sub === "resolve") {
      // The pending step of a sent application (an assessment, an account at the employer) is done.
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app resolve needs <dir>");
      const app = findApplication(person, dirArg);
      const { data } = loadRecord(app);
      if (!wasSent(data) || !data.pending) throw new Error(`${rel(app.dir)} has no pending step to resolve (a held application is finished with app reopen or app submit)`);
      const done = String(data.pending);
      const text = flag(a, "note");
      note(app, `pending step done — ${done}${text ? ` — ${text}` : ""}`, { pending: undefined, pending_kind: undefined, pending_waits_on: undefined, due: undefined }, { kind: "pending-resolved" });
      log("note", `${label(app)}: pending step done, ${done}`);
      console.log(`${rel(app.dir)}: pending step done (${done})`);
      return 0;
    }

    if (sub === "details") {
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app details needs <dir>");
      const app = findApplication(person, dirArg);
      const { data } = loadRecord(app);
      const patch = detailsFromArgs(a, data);
      if (!Object.keys(patch).length) throw new Error("app details needs at least one employer, location, or contact flag");
      note(app, `details updated${flag(a, "note") ? ` — ${flag(a, "note")}` : ""}`, patch, { kind: "details-updated" });
      console.log(`updated details in ${rel(app.recordPath!)}`);
      return 0;
    }

    if (sub === "event") {
      const [dirArg, kind] = a._;
      if (!dirArg || !kind) throw new Error(`app event needs <dir> <kind> (for example contacted or interview-attended; known: ${APPLICATION_EVENT_KINDS.join(", ")})`);
      // Lifecycle state changes have their own commands so status, reminders, and queue stay in sync.
      if (["created", "details-updated", "submitted", "held", "skipped", "reopened", "pending-resolved", "interview-scheduled", "interview-rescheduled", "interview-cancelled", "start-scheduled", ...OUTCOME_STATUS].includes(kind)) throw new Error("use app new/details/submit/hold/skip/reopen/resolve or outcome for this lifecycle event");
      const app = findApplication(person, dirArg);
      const { data } = loadRecord(app);
      const on = onFromArgs(a);
      const atArg = flag(a, "at");
      const at = atArg ? normalizeAt(atArg) : null;
      if (has(a, "at") && (!at || !eventDate(at.text))) throw new Error("--at needs an interview datetime with offset");
      if (at && kind !== "interview-attended") throw new Error("app event --at goes with interview-attended");
      const method = flag(a, "contact-method");
      if (has(a, "contact-method") && !method?.trim()) throw new Error("--contact-method needs text");
      const patch: Record<string, unknown> = {};
      if (kind === "contacted") {
        const date = on.slice(0, 10);
        if (!data.date_contacted || date < data.date_contacted) patch.date_contacted = date;
        if (method) patch.contact_method = method;
      }
      const text = flag(a, "note");
      const round = flag(a, "round");
      note(app, `${kind}${at ? ` (interview ${at.text})` : ""}${round ? ` [${round}]` : ""}${text ? ` — ${text}` : ""}`, patch,
        { kind, on, ...(text ? { note: text } : {}), ...(at ? { at: at.text } : {}), ...(round ? { round } : {}), ...(method ? { contact_method: method } : {}) });
      console.log(`recorded ${kind} in ${rel(app.recordPath!)}`);
      return 0;
    }

    if (sub === "history") {
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app history needs <dir>");
      const { data } = loadRecord(findApplication(person, dirArg));
      const format = flag(a, "format") ?? "text";
      if (!["text", "json"].includes(format)) throw new Error("--format must be text or json");
      const events = data.events ?? [];
      if (!Array.isArray(events)) throw new Error("events must be a list; repair the record");
      if (format === "json") console.log(JSON.stringify(events, null, 2));
      else if (!events.length) console.log("No structured history yet. Legacy dates and notes remain in the record; no events were inferred.");
      else for (const e of events) console.log(`${e.on}: ${e.kind}${e.status ? ` [${e.status}]` : ""}${e.at ? ` (interview ${e.at})` : ""}${e.replaces ? ` (replaces ${e.replaces})` : ""}${e.round ? ` [${e.round}]` : ""}${e.start_date ? ` (start ${e.start_date})` : ""}${e.contact_method ? ` via ${e.contact_method}` : ""}${e.note ? ` — ${e.note}` : ""} (recorded ${e.recorded_at})`);
      return 0;
    }

    if (sub === "note") {
      const [dirArg, ...words] = a._;
      const text = words.join(" ").trim();
      if (!dirArg || !text) throw new Error('app note needs <dir> "<text>"');
      const app = findApplication(person, dirArg);
      note(app, text.replace(/\s*\n\s*/g, " "), {}, { on: onFromArgs(a) });
      console.log(`noted in ${rel(app.recordPath!)}`);
      return 0;
    }

    console.error(`unknown app subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
