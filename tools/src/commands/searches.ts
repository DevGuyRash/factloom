import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson, today } from "../lib/repo.ts";
import { DATE } from "../lib/schema.ts";
import {
  addSearch, closeSite, closures, dueSearches, loadSearches, loadSearchesDoc, markSearch, passStatus, pauseSearch, removeSearch, rotation,
  stamp, timeOf, type SearchItem, type SearchesDoc,
} from "../lib/searches.ts";

function fmt(s: SearchItem): string {
  const yieldNote = s.last_found !== undefined || s.last_new !== undefined
    ? ` last_found=${s.last_found ?? "?"} last_new=${s.last_new ?? "?"}${s.runs ? ` new_per_run=${((s.new_total ?? 0) / s.runs).toFixed(1)}` : ""}`
    : "";
  return `${s.id.padEnd(24)} variant=${s.variant ?? "?"} site=${s.site ?? "?"} every_days=${s.every_days} last_run=${s.last_run ?? "never"}${yieldNote}`;
}

/** The pass, closed sites, and paused searches, in a few lines. */
function state(doc: SearchesDoc): string[] {
  const p = passStatus(doc);
  const { closed, paused } = closures(doc);
  const lines = [p.started ? `pass since ${p.started}: ${p.ran} of ${p.open} open searches run, ${p.new} new posting(s) so far` : "no pass going: the next `searches mark` starts one"];
  if (doc.last_pass) lines.push(`last pass: ${doc.last_pass.started} to ${doc.last_pass.ended}, ${doc.last_pass.searches} searches, ${doc.last_pass.new} new posting(s)`);
  for (const c of closed) lines.push(`closed: ${c.site} until ${c.until}${c.reason ? ` (${c.reason})` : ""}`);
  for (const s of paused) lines.push(`paused: ${s.id} until ${s.paused_until}${s.paused_reason ? ` (${s.paused_reason})` : ""}`);
  return lines;
}

/** A date or date-time for --until; a bare date means the start of that day. */
function until(value: string | undefined, fallback: string): string {
  const v = value ?? fallback;
  if (!DATE.test(v) && !Number.isFinite(timeOf(v))) throw new Error(`--until takes YYYY-MM-DD or a date and time, not ${v}`);
  return v;
}

const addDays = (days: number) => {
  const d = new Date(`${today()}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
};

/**
 * Saved searches per resume variant. `next` suggests what to run, the searches run longest ago first, with their
 * yields; `mark` records a run and counts the pass; `pause` and `close-site` set a search or a site aside for a
 * while, so later activations know; `due` lists what is due between sessions by each search's `every_days`.
 */
const command: Command = {
  name: "searches",
  summary: "Saved searches: what to run next, record runs and passes, add, pause, close a site, remove",
  usage: [
    "resumes searches list|due [--person p]",
    "resumes searches next [--count N] [--person p]",
    "resumes searches add <id> --url <url> [--variant v] [--site s] [--query q] [--filters f] [--every-days N] [--person p]",
    "resumes searches mark <search-id> [--found N] [--new N] [--person p]",
    "resumes searches pause <search-id> [--until YYYY-MM-DD] [--reason TEXT] [--clear] [--person p]",
    "resumes searches close-site <site> [--until <date or date and time>] [--reason TEXT] [--clear] [--person p]",
    "resumes searches remove <search-id> [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest, ["clear"]);
    const person = resolvePerson(flag(a, "person"));
    const count = (name: string) => {
      const v = flag(a, name);
      if (v === undefined) return undefined;
      if (!/^\d+$/.test(v)) throw new Error(`--${name} takes a whole number`);
      return Number(v);
    };

    if (sub === "list") {
      for (const s of loadSearches(person).items) console.log(fmt(s));
      for (const line of state(loadSearchesDoc(person).data)) console.log(line);
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
      const doc = loadSearchesDoc(person).data;
      if (!doc.items.length) {
        console.log("no saved searches: add one for each target title on each job site (resumes searches add)");
        return 0;
      }
      for (const line of state(doc)) console.log(line);
      const order = rotation(person).slice(0, count("count") ?? 1);
      if (!order.length) {
        console.log("every saved search is paused or on a closed site");
        return 0;
      }
      console.log("suggested next (run longest ago first; take another when you have a reason):");
      for (const s of order) {
        console.log(fmt(s));
        for (const [k, v] of [["url", s.url], ["query", s.query], ["filters", s.filters]] as const) if (v) console.log(`  ${k}: ${v}`);
      }
      return 0;
    }
    if (sub === "add") {
      const id = a._[0];
      const url = flag(a, "url");
      if (!id || !url) throw new Error("searches add needs <id> and --url");
      const item = addSearch(person, {
        id, variant: flag(a, "variant"), site: flag(a, "site"), url, query: flag(a, "query"), filters: flag(a, "filters"),
        every_days: count("every-days") ?? 1,
      });
      console.log(`added ${fmt(item)}`);
      return 0;
    }
    if (sub === "mark") {
      const id = a._[0];
      if (!id) throw new Error("searches mark needs <search-id>");
      const marked = markSearch(person, id, undefined, { found: count("found"), new: count("new") });
      if (!marked) {
        console.error(`no search ${id}`);
        return 1;
      }
      console.log(`marked ${id} run at ${marked.item.last_run}`);
      if (marked.completed) {
        const p = marked.completed;
        console.log(`pass complete: ${p.searches} open searches run since ${p.started}, ${p.new} new posting(s)${p.new === 0 ? " (nothing new: see the skill's \"When leads run out\")" : ""}`);
      } else for (const line of state(marked.doc).slice(0, 1)) console.log(line);
      return 0;
    }
    if (sub === "pause") {
      const id = a._[0];
      if (!id) throw new Error("searches pause needs <search-id>");
      const item = pauseSearch(person, id, has(a, "clear") ? null : until(flag(a, "until"), addDays(7)), flag(a, "reason"));
      if (!item) {
        console.error(`no search ${id}`);
        return 1;
      }
      console.log(item.paused_until ? `paused ${id} until ${item.paused_until}` : `${id} is back in the rotation`);
      return 0;
    }
    if (sub === "close-site") {
      const site = a._[0];
      if (!site) throw new Error("searches close-site needs <site>");
      // By default for the rest of the day; a site that names its own retry time gets that instead.
      const end = has(a, "clear") ? null : until(flag(a, "until"), stamp(new Date(`${addDays(1)}T00:00:00`)));
      closeSite(person, site, end, flag(a, "reason"));
      console.log(end ? `closed ${site} until ${end}` : `reopened ${site}`);
      return 0;
    }
    if (sub === "remove") {
      const id = a._[0];
      if (!id) throw new Error("searches remove needs <search-id>");
      if (!removeSearch(person, id)) {
        console.error(`no search ${id}`);
        return 1;
      }
      console.log(`removed ${id}`);
      return 0;
    }
    console.error(`unknown searches subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
