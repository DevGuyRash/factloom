import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { findCompany } from "../lib/companies.ts";
import { peek, readDoc } from "../lib/frontmatter.ts";
import { personOf, repoRoot, today, walkMarkdown } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";
import { matchStories, listStories } from "../lib/stories.ts";
import { renderTemplate } from "../lib/templates.ts";

const KINDS = {
  "follow-up": { template: "follow-up", file: FILE_NAMES.followUp },
  "thank-you": { template: "thank-you", file: FILE_NAMES.thankYou },
  "interview-prep": { template: "interview-prep", file: FILE_NAMES.interviewPrep },
} as const;
type Kind = keyof typeof KINDS;

/** The application record and posting snapshot found directly in an application directory. */
function readApplicationDir(dir: string) {
  let record: Record<string, unknown> | null = null;
  let recordBody = "";
  let posting: Record<string, unknown> | null = null;
  let postingBody = "";
  for (const p of walkMarkdown(dir)) {
    const fm = peek(p);
    if (fm?.type === "application" && !record) ({ data: record, body: recordBody } = readDoc(p));
    if (fm?.type === "posting" && !posting) ({ data: posting, body: postingBody } = readDoc(p));
  }
  return { record, recordBody, posting, postingBody };
}

/** `draft follow-up|thank-you|interview-prep <application-dir>`: renders into that application directory. */
const command: Command = {
  name: "draft",
  summary: "Draft a follow-up, thank-you, or interview-prep document for an application",
  usage: "resumes draft <follow-up|thank-you|interview-prep> <application-dir> [--force]",
  run(argv) {
    const a = parseArgs(argv, ["force"]);
    const kind = a._[0] as Kind | undefined;
    const dirArg = a._[1];
    if (!kind || !(kind in KINDS) || !dirArg) { console.error(`usage: ${command.usage}`); return 2; }
    const dir = isAbsolute(dirArg) ? dirArg : join(process.cwd(), dirArg);
    if (!existsSync(dir)) { console.error(`${dirArg}: not found`); return 2; }
    const { person } = personOf(dir);
    // Root is the repository that *this application directory* lives in, not wherever the CLI
    // happens to be installed — the two differ under test fixtures and must still agree here.
    const parts = resolve(dir).split(sep);
    const root = parts.slice(0, parts.lastIndexOf("people")).join(sep) || repoRoot();
    const { record, recordBody, posting, postingBody } = readApplicationDir(dir);
    if (!record) { console.error(`${dirArg}: no application record (expected a type: application file)`); return 1; }

    let profile: Record<string, unknown> = {};
    for (const p of walkMarkdown(join(root, "people", person))) {
      const fm = peek(p);
      if (fm?.type === "profile") { profile = readDoc(p).data as Record<string, unknown>; break; }
    }

    const company = String(record.company ?? "");
    const role = String(record.role ?? "");
    const dossier = company ? findCompany(company, root) : null;
    const stories = listStories(person, root);
    const relevanceText = [role, postingBody, String(posting?.description ?? "")].join(" ");
    const matched = matchStories(stories, relevanceText, 5);
    const competencies = [...new Set(matched.flatMap((s) => s.competencies))];
    const postingSummary = postingBody.replace(/^#.*$/m, "").replace(/##\s*Description\s*/i, "").trim() || undefined;

    const { file } = KINDS[kind];
    const out = join(dir, file);
    if (existsSync(out) && !has(a, "force")) { console.error(`${out} exists; pass --force to replace it`); return 1; }

    const context = {
      person, name: profile.name, email: profile.email, phone: profile.phone,
      company, role, application: dirArg.split(/[\\/]/).filter(Boolean).pop(),
      applied: record.applied, status: record.status, url: record.url,
      dossier: dossier?.data ?? null, postingSummary,
      stories: matched.map((s) => ({ id: s.id, competencies: s.competencies, situation: s.situation, action: s.action, result: s.result })),
      competencies, date: today(),
    };
    writeFileSync(out, renderTemplate(KINDS[kind].template, context, person, root));
    console.log(`wrote ${out}`);
    return 0;
  },
};
export default command;
