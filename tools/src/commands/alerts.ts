import { readFileSync } from "node:fs";
import { flag, has, parseArgs } from "../lib/args.ts";
import { extractPostings } from "../lib/alerts.ts";
import type { Command } from "../lib/command.ts";
import { findEmployer } from "../lib/employers.ts";
import { enqueue } from "../lib/queue.ts";
import { resolvePerson } from "../lib/repo.ts";

function readInput(fileOrDash: string): string {
  if (fileOrDash === "-") return readFileSync(0, "utf8");
  return readFileSync(fileOrDash, "utf8");
}

/** `alerts <file|-> [--person p] [--dry-run]`: extracts posting URLs from a job-alert digest and queues them. */
const command: Command = {
  name: "alerts",
  summary: "Extract job posting URLs from a job-alert email/page and enqueue them",
  usage: "resumes alerts <file|-> [--person <slug>] [--dry-run]",
  run(argv) {
    const a = parseArgs(argv, ["dry-run"]);
    const source = a._[0];
    if (!source) { console.error(`usage: ${command.usage}`); return 2; }
    const person = resolvePerson(flag(a, "person"));
    const postings = extractPostings(readInput(source));
    if (!postings.length) { console.log("no job posting URLs found"); return 0; }
    const dryRun = has(a, "dry-run");
    for (const p of postings) {
      const label = [p.role, p.company].filter(Boolean).join(" @ ");
      if (dryRun) { console.log(`[dry run] would enqueue ${p.url}${label ? ` (${label})` : ""} [${p.source}]`); continue; }
      const employer = p.company ? findEmployer(person, p.company) : null;
      if (employer?.blocked) {
        console.log(`skipped (blocked employer "${employer.company}") ${p.url}${label ? ` (${label})` : ""}`);
        continue;
      }
      const result = enqueue(person, { url: p.url, company: p.company, role: p.role, source: p.source });
      console.log(`${result.added ? "queued" : `skipped (${result.reason})`} ${p.url}${label ? ` (${label})` : ""}`);
    }
    return 0;
  },
};
export default command;
