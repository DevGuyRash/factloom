import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson } from "../lib/repo.ts";
import { addSearch, dueSearches, loadSearches, markSearch, nextSearch, type SearchItem } from "../lib/searches.ts";

function fmt(s: SearchItem): string {
  return `${s.id.padEnd(24)} variant=${s.variant ?? "?"} site=${s.site ?? "?"} every_days=${s.every_days} last_run=${s.last_run ?? "never"}`;
}

/**
 * Lists saved searches per resume variant, shows which are due (never run, or stale by their own `every_days`),
 * names the next one in a long run's rotation (the one run longest ago), saves a new one, or marks one run now.
 */
const command: Command = {
  name: "searches",
  summary: "List saved searches, show which are due or which to run next, add one, or mark one run",
  usage:
    "resumes searches list|due [--person p]\n" +
    "       resumes searches next [--skip-sites a,b] [--person p]\n" +
    "       resumes searches add <id> --url <url> [--variant v] [--site s] [--query q] [--filters f] [--every-days N] [--person p]\n" +
    "       resumes searches mark <search-id> [--person p]",
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
    if (sub === "next") {
      const skip = (flag(a, "skip-sites") ?? "").split(",").filter(Boolean);
      const s = nextSearch(person, undefined, skip);
      if (!s) {
        console.log(
          loadSearches(person).items.length
            ? `every saved search is on a skipped site (${skip.join(", ")})`
            : "no saved searches: add one for each target title on each job site (resumes searches add)",
        );
        return 0;
      }
      console.log(fmt(s));
      for (const [k, v] of [["url", s.url], ["query", s.query], ["filters", s.filters]] as const) if (v) console.log(`  ${k}: ${v}`);
      return 0;
    }
    if (sub === "add") {
      const id = a._[0];
      const url = flag(a, "url");
      if (!id || !url) throw new Error("searches add needs <id> and --url");
      const days = flag(a, "every-days");
      const item = addSearch(person, {
        id, variant: flag(a, "variant"), site: flag(a, "site"), url, query: flag(a, "query"), filters: flag(a, "filters"),
        every_days: days === undefined ? 1 : Number(days),
      });
      console.log(`added ${fmt(item)}`);
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
      console.log(`marked ${id} run at ${item.last_run}`);
      return 0;
    }
    console.error(`unknown searches subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
