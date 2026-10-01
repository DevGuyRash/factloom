import { writeFileSync, existsSync } from "node:fs";
import { flag, has, parseArgs, collectSets } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { listTemplates, renderTemplate, resolveTemplate } from "../lib/templates.ts";
import { rel } from "../lib/repo.ts";

/** Render any document template: `resumes template <name> --person p [--out file] [--set key=value ...]`. */
const command: Command = {
  name: "template",
  summary: "List document templates or render one (person overrides win)",
  usage: "resumes template [list] | resumes template <name> --person <slug> [--out <file>] [--force] [--set key=value ...]",
  run(argv) {
    const a = parseArgs(argv, ["force"]);
    const person = flag(a, "person");
    if (!a._.length || a._[0] === "list") {
      for (const t of listTemplates(person)) console.log(`${t.padEnd(24)} ${rel(resolveTemplate(t, person))}`);
      return 0;
    }
    const text = renderTemplate(a._[0], { person, ...collectSets(argv) }, person);
    const out = flag(a, "out");
    if (!out) { process.stdout.write(text); return 0; }
    if (existsSync(out) && !has(a, "force")) { console.error(`${out} exists; pass --force to replace it`); return 1; }
    writeFileSync(out, text);
    console.log(`wrote ${out}`);
    return 0;
  },
};
export default command;
