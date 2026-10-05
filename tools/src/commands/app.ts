import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { flag, has, parseArgs } from "../lib/args.ts";
import { createApplication, describeApplication, findApplication, findDuplicate, loadRecord, type Application } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { findEmployer } from "../lib/employers.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { updateFor } from "../lib/queue.ts";
import { rel, resolvePerson, stamp, today } from "../lib/repo.ts";
import { logEvent } from "../lib/runlog.ts";
import { DATE } from "../lib/schema.ts";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

/** Appends a dated line to a record's body, applying a frontmatter patch (a key set to undefined is removed). */
function note(app: Application, line: string, patch: Record<string, unknown> = {}) {
  const { data, body } = loadRecord(app);
  const next = Object.fromEntries(Object.entries({ ...data, ...patch, updated: today() }).filter(([, v]) => v !== undefined));
  writeDoc(app.recordPath!, next, `${body.trimEnd()}\n\n- ${today()}: ${line}\n`);
}

/**
 * Adds the answers given on the form (one line each: the question, the answer, its source) under the record's
 * "Answers given" heading, so they are written once, by the command, not edited into the record by hand.
 */
function addAnswers(app: Application, file: string | undefined) {
  if (file === undefined) return;
  const lines = readFileSync(file === "-" ? 0 : file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith("- ") ? l : `- ${l}`));
  if (!lines.length) return;
  const { data, body } = loadRecord(app);
  const heading = /^## Answers given\s*$/m;
  const next = heading.test(body)
    ? body.replace(/(^## Answers given\s*\n(?:(?!^## ).*\n?)*)/m, (section) => `${section.trimEnd()}\n${lines.join("\n")}\n\n`)
    : `${body.trimEnd()}\n\n## Answers given\n\n${lines.join("\n")}\n`;
  writeDoc(app.recordPath!, data, next);
}

/** Kinds of hold, so the waiting list groups what the person must do and retries know what to look for. */
const HOLD_KINDS = ["answer", "person-step", "account", "captcha", "upload", "site", "confirmation", "other"] as const;

const label = (app: Application) => `${app.record?.company ?? "?"} — ${app.record?.role ?? "?"}`;

/**
 * `app new` creates an application, refusing blocked employers and the same job twice, and showing a possible
 * duplicate for the agent to judge. `submitting` marks the moment before the final click; `submit`, `hold`, `skip`,
 * and `reopen` update the record, its queue entry, and the run log (unless --no-log); `note` adds a dated line,
 * so records are never edited by hand.
 */
const command: Command = {
  name: "app",
  summary: "Create, submit, hold, skip, or reopen a job application",
  usage: [
    "resumes app new --company <name> --role <title> [--url U] [--source S] [--site Z] [--requisition R] [--posted YYYY-MM-DD] [--posting-file <file|->] [--location L] [--arrangement A] [--pay-min N] [--pay-max N] [--pay-period hour|year] [--distinct-from <dir> --because TEXT] [--person p]",
    "resumes app submitting <dir> [--person p]",
    "resumes app submit <dir> [--confirmation TEXT] [--proof <file>] [--answers <file|->] [--follow-up <days|YYYY-MM-DD>] [--no-log] [--person p]",
    "resumes app hold <dir> --reason TEXT [--kind answer|person-step|account|captcha|upload|site|confirmation|other] [--waits <catalog-id>] [--answers <file|->] [--no-log] [--person p]",
    "resumes app skip <dir> --reason TEXT [--rule <catalog-id>] [--no-log] [--person p]",
    "resumes app reopen <dir> --reason TEXT [--person p]",
    'resumes app note <dir> "<text>" [--person p]',
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
      const app = createApplication(person, {
        ...job, site: flag(a, "site"), posted, description, location: flag(a, "location"), arrangement: flag(a, "arrangement"),
        pay_min: number("pay-min"), pay_max: number("pay-max"), pay_period: flag(a, "pay-period"),
      }, undefined, { distinct: true });
      if (dup) {
        note(app, `a different job from ${dup.app.name}: ${because}`);
        note(dup.app, `${app.name} is a different job: ${because}`);
      }
      updateFor(person, { url: job.url, source: job.source }, { status: "in-progress" });
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
      writeDoc(app.recordPath!, { ...data, submit_clicked: stamp(), updated: today() }, body);
      log("note", `submitting ${label(app)}`);
      console.log(`${rel(app.dir)}: submit marked; run app submit as soon as the site confirms`);
      return 0;
    }

    if (sub === "submit") {
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app submit needs <dir>");
      const app = findApplication(person, dirArg);
      const { data, body } = loadRecord(app);
      const applied = today();
      const cfg = loadPipelineConfig();
      // The pipeline's follow_up_days is the default; a posting that states its own timeline can set another.
      const followUp = flag(a, "follow-up");
      if (followUp && !DATE.test(followUp) && !/^\d+$/.test(followUp)) throw new Error("--follow-up takes a number of days or a YYYY-MM-DD date");
      data.status = "submitted";
      data.applied = applied;
      data.follow_up = followUp && DATE.test(followUp) ? followUp : addDays(applied, followUp ? Number(followUp) : cfg.follow_up_days);
      data.updated = applied;
      delete data.submit_clicked;
      const confirmation = flag(a, "confirmation");
      if (confirmation) data.confirmation = confirmation;
      const proof = flag(a, "proof");
      if (proof) {
        if (!existsSync(proof)) throw new Error(`${proof} does not exist`);
        const destName = `confirmation${extname(proof) || ".txt"}`;
        if (join(app.dir, destName) !== proof) copyFileSync(proof, join(app.dir, destName));
        data.proof = destName;
        if (!data.confirmation) data.confirmation = destName;
      }
      writeDoc(app.recordPath!, data, body);
      addAnswers(app, flag(a, "answers"));
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
      const app = findApplication(person, dirArg);
      addAnswers(app, flag(a, "answers"));
      const status = loadRecord(app).data.status;
      if (status === "submitted") {
        // Sent, with a step still to come (an assessment, an account at the employer): it stays submitted, and keeps
        // what the step waits on, so an answer that settles it points back here.
        note(app, `pending — ${reason}`, { pending: reason, pending_kind: kind, pending_waits_on: waits });
        log("note", `${label(app)}: sent, pending ${reason}`);
        console.log(`${rel(app.dir)} stays submitted; pending: ${reason}`);
        return 0;
      }
      note(app, `held — ${reason}`, { status: "blocked", hold_kind: kind, waits_on: waits });
      // The record now carries the posting; its queue entry is done, so it does not come back from `queue next`.
      updateFor(person, loadRecord(app).data, { status: "done", outcome: "held", note: reason, application: app.name });
      log("held", `${label(app)}: ${reason}`);
      console.log(`held ${rel(app.dir)}: ${reason}`);
      return 0;
    }

    if (sub === "skip") {
      const dirArg = a._[0];
      const reason = flag(a, "reason");
      if (!dirArg || !reason) throw new Error("app skip needs <dir> --reason TEXT");
      const app = findApplication(person, dirArg);
      const rule = flag(a, "rule");
      note(app, `skipped — ${reason}`, { status: "skipped", skip_rule: rule });
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
      const status = loadRecord(app).data.status;
      if (status !== "skipped" && status !== "blocked") throw new Error(`${rel(app.dir)} is ${status}; only skipped or held applications reopen`);
      note(app, `reopened — ${reason}`, { status: "drafted", hold_kind: undefined, waits_on: undefined, skip_rule: undefined });
      console.log(`reopened ${rel(app.dir)}: ${reason}`);
      return 0;
    }

    if (sub === "note") {
      const [dirArg, ...words] = a._;
      const text = words.join(" ").trim();
      if (!dirArg || !text) throw new Error('app note needs <dir> "<text>"');
      const app = findApplication(person, dirArg);
      note(app, text.replace(/\s*\n\s*/g, " "));
      console.log(`noted in ${rel(app.recordPath!)}`);
      return 0;
    }

    console.error(`unknown app subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
