// Validate the repository's conventions: `resumes check [root]`. Exit 1 on errors. Each rule is
// a small module in tools/src/checks/, registered below; this command only walks the Markdown
// docs once and runs every rule over that shared context.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../lib/frontmatter.ts";
import { rel as relTo, repoRoot, walkMarkdown } from "../lib/repo.ts";
import type { Command } from "../lib/command.ts";
import type { CheckContext, DocEntry, Rule } from "../checks/types.ts";
import frontmatterTypes from "../checks/frontmatter-types.ts";
import personProfile from "../checks/person-profile.ts";
import activeVariants from "../checks/active-variants.ts";
import applications from "../checks/applications.ts";
import answers from "../checks/answers.ts";
import coverLetterLint from "../checks/cover-letter-lint.ts";
import docCommands from "../checks/doc-commands.ts";
import docsConsistency from "../checks/docs-consistency.ts";
import trackedFiles from "../checks/tracked-files.ts";

/** Registered in the order the Python checker ran them; tracked-files last (it shells out to git). */
const RULES: Rule[] = [frontmatterTypes, personProfile, activeVariants, applications, answers, coverLetterLint, docsConsistency, docCommands, trackedFiles];

function buildDocs(root: string): DocEntry[] {
  const files = ["people", "custom", "shared"].flatMap((d) => walkMarkdown(join(root, d), { includeArchive: true }));
  return files.map((path): DocEntry => {
    const rel = relTo(path, root);
    try {
      const { data, body } = parse(readFileSync(path, "utf8"));
      return { path, rel, data, body };
    } catch (e) {
      return { path, rel, data: null, body: "", parseError: e instanceof Error ? e.message : String(e) };
    }
  });
}

/** Runs every registered rule over `root`; exported so tests can call it directly on a fixture. */
export async function run(root: string): Promise<{ errors: string[]; warnings: string[] }> {
  const docs = buildDocs(root);
  const byPath = new Map(docs.map((d) => [d.path, d] as const));
  const ctx: CheckContext = { root, docs, byType: (t) => docs.filter((d) => d.data?.type === t), byPath };
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const rule of RULES) {
    const res = await rule.run(ctx);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }
  return { errors, warnings };
}

const command: Command = {
  name: "check",
  summary: "Validate the repository's conventions (exit 1 on errors)",
  usage: "resumes check [root]",
  async run(argv) {
    const root = argv[0] ? resolve(argv[0]) : repoRoot();
    const { errors, warnings } = await run(root);
    for (const w of warnings) console.log(`warning: ${w}`);
    for (const e of errors) console.log(`error: ${e}`);
    console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
    return errors.length ? 1 : 0;
  },
};
export default command;
