import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson } from "../lib/repo.ts";
import { findStories, listStories } from "../lib/stories.ts";

/** Story bank: `stories list|find <competency>`, scoped to one person's people/<person>/stories.md. */
const command: Command = {
  name: "stories",
  summary: "List stories, or find ones that demonstrate a competency",
  usage: "resumes stories list [--person <slug>] | resumes stories find <competency> [--person <slug>]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const [sub, ...rest] = a._;
    if (sub === "find") {
      if (!rest[0]) { console.error("usage: resumes stories find <competency> [--person <slug>]"); return 2; }
      for (const s of findStories(person, rest.join(" "))) console.log(`${s.id}\t${s.competencies.join(", ")}`);
      return 0;
    }
    if (sub === "list" || !sub) {
      for (const s of listStories(person)) console.log(`${s.id}\t${s.competencies.join(", ")}`);
      return 0;
    }
    console.error(`unknown subcommand ${sub}; usage: ${command.usage}`);
    return 2;
  },
};
export default command;
