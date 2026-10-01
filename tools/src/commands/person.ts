import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listApplications } from "../lib/applications.ts";
import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { peek } from "../lib/frontmatter.ts";
import { findByType, findOne, listPeople, personDir, rel, today } from "../lib/repo.ts";
import { renderTemplate } from "../lib/templates.ts";
import { slugify } from "../lib/text.ts";

/** Starts a person from the templates, or lists everyone with their state. */
const command: Command = {
  name: "person",
  summary: "List people, or create one from the templates (profile, answers, inbox, evidence, starter facts.yaml)",
  usage: 'resumes person [list] | person new "Full Name" [--email E] [--phone P] [--location L] [--link URL ...]',
  run(argv) {
    const a = parseArgs(argv);
    if ((a._[0] ?? "list") === "list") {
      for (const p of listPeople()) {
        const profile = findOne(p, "profile");
        const fm = profile ? peek(profile) : null;
        const variants = findByType(join(personDir(p), "resumes", "active"), "resume-guide").length;
        console.log(`${p.padEnd(18)} apply: ${String(fm?.apply ?? "?").padEnd(9)} variants: ${variants}  applications: ${listApplications(p).length}`);
      }
      return 0;
    }
    if (a._[0] !== "new" || !a._[1]) { console.error(command.usage); return 2; }
    const name = a._.slice(1).join(" ");
    const person = slugify(name);
    const dir = personDir(person);
    if (existsSync(dir)) { console.error(`people/${person} already exists`); return 1; }
    const links = argv.flatMap((v, i) => (argv[i - 1] === "--link" ? [v] : []));
    const ctx = { person, name, email: flag(a, "email"), phone: flag(a, "phone"), location: flag(a, "location"), links, date: today() };
    mkdirSync(join(dir, "resumes", "active"), { recursive: true });
    for (const [tpl, file] of [["profile", "profile.md"], ["answers", "answers.md"], ["inbox", "inbox.md"], ["evidence", "evidence.md"]] as const) {
      writeFileSync(join(dir, file), renderTemplate(tpl, ctx, person));
    }
    mkdirSync(join(dir, "resumes", "source", "variants"), { recursive: true });
    writeFileSync(join(dir, "resumes", "source", "facts.yaml"), renderTemplate("facts.yaml", ctx, person));
    console.log(`created ${rel(dir)} (apply: disabled until the person wants applications run)`);
    console.log(`next: \`./resumes import <their resume.docx|pdf> --person ${person}\`, then fill resumes/source/facts.yaml from it and \`./resumes variant new <name> --person ${person}\``);
    return 0;
  },
};
export default command;
