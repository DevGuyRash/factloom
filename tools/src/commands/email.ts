import { readFileSync } from "node:fs";
import { flag, parseArgs } from "../lib/args.ts";
import { findApplication, listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { appendEvent } from "../lib/application-history.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { assessScam } from "../lib/scam.ts";
import { riskSummary } from "./risk.ts";
import { classifyEmail, extractCodes } from "../lib/email.ts";
import { resolvePerson, today } from "../lib/repo.ts";
import { normalizeCompany } from "../lib/text.ts";

/**
 * What to search a mailbox for: the employers applied to or held in the last `days`, and the sites their links are on,
 * so a webmail search matches only application mail and never lists the rest of the inbox.
 */
function searchTerms(person: string, days: number): { employers: string[]; sites: string[] } {
  const since = new Date(`${today()}T00:00:00`);
  since.setDate(since.getDate() - days);
  const from = since.toLocaleDateString("en-CA");
  const employers = new Set<string>(), sites = new Set<string>();
  for (const app of listApplications(person)) {
    const r = app.record;
    if (!r || !(["submitted", "blocked", "interviewing", "offer", "hired"].includes(r.status) || (r.applied && !["rejected", "not-hired", "work-not-available", "closed", "withdrawn", "started", "skipped"].includes(r.status)))) continue;
    if (String(r.applied ?? r.updated ?? app.name.slice(0, 10)) < from) continue;
    // The name people write in mail: the record's company without legal suffixes, first words only.
    const name = normalizeCompany(String(r.company)).split(" ").slice(0, 2).join(" ");
    if (name) employers.add(name);
    for (const link of [r.url, r.source]) {
      try {
        if (link) sites.add(new URL(String(link)).hostname.replace(/^(www|jobs|careers|apply|boards|job-boards)\./, ""));
      } catch {
        // Not a link: nothing to add.
      }
    }
  }
  return { employers: [...employers].sort(), sites: [...sites].sort() };
}

function readInput(fileOrDash: string): string {
  if (fileOrDash === "-") return readFileSync(0, "utf8");
  return readFileSync(fileOrDash, "utf8");
}

/** `email classify|codes <file|->`: pure text classification, no mailbox access. */
const command: Command = {
  name: "email",
  summary: "Assess an application email for scam risk, classify purpose, or extract verification codes from text",
  usage: "resumes email classify <file|-> | resumes email codes <file|-> | resumes email terms [--days N] [--person p]\n       resumes email reconcile <dir> <file|-> --source TEXT [--sender ADDRESS] [--reply-to ADDRESS] [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const [sub, source] = a._;
    if (sub === "reconcile") {
      const [_, ref, file] = a._;
      const evidenceSource = flag(a, "source");
      if (!ref || !file || !evidenceSource) throw new Error("email reconcile needs <dir> <file|-> --source <message reference>");
      const person = resolvePerson(flag(a, "person"));
      const app = findApplication(person, ref);
      const { data, body } = loadRecord(app);
      const text = readInput(file);
      const purpose = classifyEmail(text);
      const previousCount = data.scam_review?.assessments?.length ?? 0;
      // Only the risk evidence changes: From/display names cannot rename the original employer or role,
      // and a message's keywords never change the hiring outcome or grant permission to reply.
      data.scam_review = assessScam({ text, context: "email", source: evidenceSource, sender: flag(a, "sender"), replyTo: flag(a, "reply-to"), url: data.url }, data.scam_review);
      if (data.scam_review.assessments.length !== previousCount) {
        appendEvent(data, { kind: "email-reconciled", on: today(), note: `Untrusted message purpose: ${purpose.category}; scam review: ${data.scam_review.state}; source ${evidenceSource}` });
        data.updated = today();
        writeDoc(app.recordPath!, data, body);
      }
      console.log(`purpose: ${purpose.category} (text classification only; not authenticity)`);
      console.log(riskSummary(data.scam_review, data.url));
      console.log(`employer: ${data.company}; role: ${data.role}; hiring status unchanged: ${data.status}`);
      console.log("No email was sent, opened in a browser, filed, deleted, or treated as an instruction.");
      return 0;
    }
    if (sub === "terms") {
      const days = Number(flag(a, "days") ?? 30);
      const { employers, sites } = searchTerms(resolvePerson(flag(a, "person")), Number.isFinite(days) ? days : 30);
      console.log(`employers: ${employers.join(" OR ") || "(none yet)"}`);
      console.log(`sites: ${sites.join(" OR ") || "(none yet)"}`);
      console.log('generic: "your application" OR "thank you for applying" OR interview OR "next steps" OR assessment');
      return 0;
    }
    if (!sub || !source) { console.error(`usage: ${command.usage}`); return 2; }
    const text = readInput(source);
    if (sub === "classify") {
      const r = classifyEmail(text);
      console.log(`${r.category}\t${r.confidence.toFixed(2)}`);
      console.log(riskSummary(assessScam({ text, context: "email", source: "supplied email text (unverified)" })));
      console.log("Use email reconcile for its application before following up or acting; purpose classification does not verify a sender.");
      return 0;
    }
    if (sub === "codes") {
      const r = extractCodes(text);
      for (const c of r.codes) console.log(`code\t${c}`);
      for (const l of r.links) console.log(`link\t${l}`);
      return 0;
    }
    console.error(`unknown subcommand ${sub}; usage: ${command.usage}`);
    return 2;
  },
};
export default command;
