import { writeFileSync, existsSync } from "node:fs";
import { flag, has, parseArgs, collectSets } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { readDoc } from "../lib/frontmatter.ts";
import { listTemplates, renderTemplate, resolveTemplate } from "../lib/templates.ts";
import { findOne, rel, repoRoot } from "../lib/repo.ts";

/** How this computer runs the tools: `resumes.cmd` on Windows, `./resumes` elsewhere. */
const CLI = process.platform === "win32" ? "resumes.cmd" : "./resumes";

/**
 * What a template rendered for a person can use besides --set values: their name, this repository's path, and the
 * standing instruction from their profile in their own words (the automation prompt carries it to a host's schedule).
 */
function personContext(person: string): Record<string, unknown> {
  const path = findOne(person, "profile");
  if (!path) return { repo: repoRoot(), cli: CLI };
  const { data, body } = readDoc(path);
  const section = body.split(/^(?=## )/m).find((s) => /^## Standing instruction\s*$/.test(s.split("\n")[0]));
  const instruction = section ? section.split("\n").slice(1).join("\n").replace(/<!--[\s\S]*?-->/g, "").trim() : "";
  return { name: data.name, repo: repoRoot(), cli: CLI, standing_instruction: instruction };
}

/** Render any document template: `resumes template <name> --person p [--out file] [--set key=value ...]`. */
const command: Command = {
  name: "template",
  summary: "List document templates or render one (person overrides win)",
  usage: "resumes template [list] | resumes template <template> --person <slug> [--out <file>] [--force] [--set key=value ...]",
  run(argv) {
    const a = parseArgs(argv, ["force"]);
    const person = flag(a, "person");
    if (!a._.length || a._[0] === "list") {
      for (const t of listTemplates(person)) console.log(`${t.padEnd(24)} ${rel(resolveTemplate(t, person))}`);
      return 0;
    }
    const text = renderTemplate(a._[0], { person, ...(person ? personContext(person) : {}), ...collectSets(argv) }, person);
    const out = flag(a, "out");
    if (!out) { process.stdout.write(text); return 0; }
    if (existsSync(out) && !has(a, "force")) { console.error(`${out} exists; pass --force to replace it`); return 1; }
    writeFileSync(out, text);
    console.log(`wrote ${out}`);
    return 0;
  },
};
export default command;
