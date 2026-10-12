import { readFileSync } from "node:fs";
import { flag, parseArgs } from "../lib/args.ts";
import { findApplication, loadRecord } from "../lib/applications.ts";
import { appendEvent } from "../lib/application-history.ts";
import type { Command } from "../lib/command.ts";
import { readDoc, writeDoc } from "../lib/frontmatter.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { assessScam, resolveScam, scamState, scamReasons } from "../lib/scam.ts";
import type { ScamReview } from "../lib/schema.ts";

export function riskSummary(review: ScamReview | undefined, url?: string): string {
  const state = scamState(review, url);
  const lines = [`scam review: ${state}${state === "cleared" ? " (reviewed evidence; no guarantee of safety)" : " (application/follow-up actions held until review)"}`];
  for (const reason of scamReasons(review, url)) lines.push(`  ${reason}`);
  return lines.join("\n");
}

const command: Command = {
  name: "risk",
  summary: "Assess scam indicators, inspect evidence, and record independent verification or false-positive resolution",
  usage: [
    "resumes risk check <dir> [--file <file|->] [--source TEXT] [--person p]",
    "resumes risk show <dir> [--format text|json] [--person p]",
    "resumes risk resolve <dir> cleared|false-positive|confirmed-scam --reason TEXT --source TEXT [--official-url URL] [--trusted-domains <host,host>] [--person p]",
  ].join("\n       "),
  run(argv) {
    const a = parseArgs(argv);
    const [sub, ref, decision] = a._;
    const person = resolvePerson(flag(a, "person"));
    if (!ref || !["check", "show", "resolve"].includes(sub)) throw new Error(`usage: ${command.usage}`);
    const app = findApplication(person, ref);
    const { data, body } = loadRecord(app);
    if (sub === "show") {
      const format = flag(a, "format") ?? "text";
      if (!["text", "json"].includes(format)) throw new Error("--format must be text or json");
      console.log(format === "json" ? JSON.stringify({ ...data.scam_review, state: scamState(data.scam_review, data.url), ...(data.scam_review ? { recorded_state: data.scam_review.state } : {}) }, null, 2) : riskSummary(data.scam_review, data.url));
      return 0;
    }
    if (sub === "check") {
      const file = flag(a, "file");
      const text = file !== undefined ? readFileSync(file === "-" ? 0 : file, "utf8") : app.postingPath ? readDoc(app.postingPath).body : "";
      const source = flag(a, "source") ?? String(data.url ?? (app.postingPath ? rel(app.postingPath) : "application record"));
      const previousCount = data.scam_review?.assessments?.length ?? 0;
      data.scam_review = assessScam({ text, context: "posting", source, url: data.url }, data.scam_review);
      if (data.scam_review.assessments.length === previousCount) { console.log(riskSummary(data.scam_review, data.url)); return 0; }
      appendEvent(data, { kind: "scam-assessed", on: today(), note: `Posting assessment: ${data.scam_review.state}; source ${source}` });
    } else {
      if (!["cleared", "false-positive", "confirmed-scam"].includes(decision)) throw new Error("resolution is cleared, false-positive, or confirmed-scam");
      const reason = flag(a, "reason"), source = flag(a, "source");
      if (!reason || !source) throw new Error("risk resolve needs --reason and --source documenting independent verification");
      const aliases = (flag(a, "trusted-domains") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      data.scam_review = resolveScam(data.scam_review, decision as "cleared" | "false-positive" | "confirmed-scam", reason, source, flag(a, "official-url"), aliases, data.url);
      appendEvent(data, { kind: "scam-resolved", on: today(), note: `${decision}: ${reason}; source ${source}` });
    }
    data.updated = today();
    writeDoc(app.recordPath!, data, body);
    console.log(riskSummary(data.scam_review, data.url));
    console.log(`recorded in ${rel(app.recordPath!)}; hiring status remains ${data.status}`);
    return 0;
  },
};
export default command;
