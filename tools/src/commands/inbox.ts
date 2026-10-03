import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { findOne, personDir, rel, resolvePerson, today } from "../lib/repo.ts";

/** Adds and lists inbox entries in the one format the skill describes. */
const command: Command = {
  name: "inbox",
  summary: "List inbox entries or add one (new questions and suggestions for the person's review)",
  usage: 'resumes inbox [list] [--person p] | inbox add --company X --site S --question "..." --answer "..." [--decided person|derived:<source>] [--id <catalog-id>] [--suggest "..."] [--person p]',
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const path = findOne(person, "inbox") ?? join(personDir(person), "inbox.md");
    const text = existsSync(path) ? readFileSync(path, "utf8") : `---\ntype: inbox\nperson: ${person}\n---\n\n# Inbox\n`;
    if ((a._[0] ?? "list") === "list") {
      const entries = text.split(/^### /m).slice(1).map((b) => b.split("\n")[0]);
      console.log(entries.length ? entries.map((e) => `- ${e}`).join("\n") : "inbox is empty");
      return 0;
    }
    if (a._[0] !== "add") { console.error(command.usage); return 2; }
    const q = flag(a, "question");
    if (!q) { console.error("--question is required"); return 2; }
    const entry = [
      `### ${today()} ${flag(a, "company") ?? "unknown company"} (${flag(a, "site") ?? "unknown site"}): "${q}"`,
      `- Answer used: ${flag(a, "answer") ?? "held for the person"}`,
      `- Decided by: ${flag(a, "decided") ?? "person"}`,
      `- Suggested id: ${flag(a, "id") ?? "new"}`,
      `- Suggestion: ${flag(a, "suggest") ?? "add to catalog"}`,
    ].join("\n");
    writeFileSync(path, `${text.replace(/\s*$/, "")}\n\n${entry}\n`);
    console.log(`added to ${rel(path)}`);
    return 0;
  },
};
export default command;
