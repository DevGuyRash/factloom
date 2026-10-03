import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson } from "../lib/repo.ts";
import { dueSearches, loadSearches, markSearch, type SearchItem } from "../lib/searches.ts";

function fmt(s: SearchItem): string {
  return `${s.id.padEnd(24)} variant=${s.variant ?? "?"} site=${s.site ?? "?"} every_days=${s.every_days} last_run=${s.last_run ?? "never"}`;
}

/** Lists saved searches per resume variant, shows which are due (never run, or stale by their own `every_days`), or marks one run today. */
const command: Command = {
  name: "searches",
  summary: "List saved searches, show which are due, or mark one run",
  usage: "resumes searches list|due [--person p]\n       resumes searches mark <search-id> [--person p]",
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest);
    const person = resolvePerson(flag(a, "person"));

    if (sub === "list") {
      for (const s of loadSearches(person).items) console.log(fmt(s));
      return 0;
    }
    if (sub === "due") {
      const due = dueSearches(person);
      if (!due.length) {
        console.log("no searches due");
        return 0;
      }
      for (const s of due) console.log(fmt(s));
      return 0;
    }
    if (sub === "mark") {
      const id = a._[0];
      if (!id) throw new Error("searches mark needs <id>");
      const item = markSearch(person, id);
      if (!item) {
        console.error(`no search ${id}`);
        return 1;
      }
      console.log(`marked ${id} run today`);
      return 0;
    }
    console.error(`unknown searches subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
