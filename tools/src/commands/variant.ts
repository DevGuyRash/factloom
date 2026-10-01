import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { personDir, rel, repoRoot, resolvePerson, today } from "../lib/repo.ts";
import { renderTemplate } from "../lib/templates.ts";
import { slugify } from "../lib/text.ts";
import { factsPath, loadFacts, variantPath } from "../render/spec.ts";
import { DEFAULT_THEME, themePath } from "../render/theme.ts";
import { buildVariantFitted, fitNote } from "./build-resumes.ts";

/** A starter structure listing every fact, for the person to trim and reorder. */
function starterVariant(person: string, variant: string, theme: string, headline: string, root: string): string {
  const facts = loadFacts(person, root);
  const output = `${String(facts.name ?? person).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_Resume`;
  return renderTemplate("variant.yaml", {
    variant, theme, headline, output,
    skills: Object.keys(facts.skills ?? {}), jobs: Object.keys(facts.jobs ?? {}),
    projects: Object.keys(facts.projects ?? {}), lines: Object.keys(facts.lines ?? {}),
  }, person, root);
}

/** A copy of another variant's structure under a new name. */
function copiedVariant(person: string, from: string, variant: string, theme: string | undefined, headline: string | undefined, root: string): string {
  const path = variantPath(person, from, root);
  if (!existsSync(path)) throw new Error(`no variant ${from} (${rel(path, root)})`);
  const doc = YAML.parseDocument(readFileSync(path, "utf8"));
  doc.set("variant", variant);
  if (theme) doc.set("theme", theme);
  if (headline) doc.set("headline", headline);
  return doc.toString({ lineWidth: 0 });
}

const hasFacts = (person: string, root: string): boolean => {
  if (!existsSync(factsPath(person, root))) return false;
  const f = loadFacts(person, root);
  return [f.skills, f.jobs, f.projects, f.lines].some((g) => g && Object.keys(g).length);
};

/** Starts a resume variant: its active directory and guide, its structure file, and (when there are facts) its first build. */
const command: Command = {
  name: "variant",
  summary: "Create a resume variant: guide, structure (copied with --from, or listing every fact), and its first build",
  usage: 'resumes variant new <name> [--person p] [--from <variant>] [--theme <name>] [--headline "..."] [--use-for "..."] [--no-build]',
  async run(argv) {
    const a = parseArgs(argv, ["no-build"]);
    if (a._[0] !== "new" || !a._[1]) { console.error(command.usage); return 2; }
    const root = repoRoot();
    const person = resolvePerson(flag(a, "person"), root);
    const variant = slugify(a._[1]);
    const dir = join(personDir(person, root), "resumes", "active", variant);
    if (existsSync(dir)) { console.error(`${rel(dir, root)} already exists`); return 1; }
    const theme = flag(a, "theme");
    if (theme && !themePath(theme, root, person)) { console.error(`no theme named ${theme}; \`./resumes themes list\` shows them`); return 1; }
    const headline = flag(a, "headline");

    const spec = variantPath(person, variant, root);
    let wroteSpec = false;
    if (existsSync(factsPath(person, root)) && !existsSync(spec)) {
      const from = flag(a, "from");
      const text = from ? copiedVariant(person, from, variant, theme, headline, root) : starterVariant(person, variant, theme ?? DEFAULT_THEME, headline ?? "", root);
      mkdirSync(join(spec, ".."), { recursive: true });
      writeFileSync(spec, text);
      wroteSpec = true;
    }

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "guide.md"), renderTemplate("resume-guide", { person, headline, use_for: flag(a, "use-for"), date: today() }, person, root));
    console.log(`created ${rel(dir, root)}${wroteSpec ? ` and ${rel(spec, root)}` : ""}`);

    if (!wroteSpec) {
      console.log("no resumes/source/facts.yaml yet: place the resume file in that directory, or write the facts and run `./resumes build-resumes`");
      return 0;
    }
    if (has(a, "no-build") || !hasFacts(person, root)) {
      console.log(`edit ${rel(spec, root)} (and resumes/source/facts.yaml), then run \`./resumes build-resumes --person ${person} --variant ${variant}\``);
      return 0;
    }
    const fit = await buildVariantFitted(person, variant, dir, root);
    for (const f of fit.files) console.log(`wrote ${rel(f, root)}`);
    const note = fitNote(variant, undefined, fit);
    if (note) console.log(note);
    console.log(`trim and reorder ${rel(spec, root)} for this version, then rebuild with \`./resumes build-resumes --person ${person} --variant ${variant}\``);
    console.log("then research the market for it and write its guide (the job-application skill's resumes reference, \"Writing and refreshing a guide\")");
    return 0;
  },
};
export default command;
