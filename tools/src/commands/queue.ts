import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { isBlocked } from "../lib/employers.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { enqueue, loadQueue, nextItem, updateItem, type QueueItem } from "../lib/queue.ts";
import { resolvePerson } from "../lib/repo.ts";
import { normalizeUrl } from "../lib/text.ts";

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - Date.parse(`${dateStr}T00:00:00`)) / 86400000);
}

function fmt(i: QueueItem): string {
  return `[${i.status}]${i.score !== undefined ? ` score=${i.score}` : ""} ${i.company ?? "?"} — ${i.role ?? "?"} (${i.found}) ${i.url}`;
}

function resolveUrl(items: QueueItem[], ref: string): string {
  const byUrl = items.find((i) => normalizeUrl(i.url) === normalizeUrl(ref));
  if (byUrl) return byUrl.url;
  const idx = Number(ref);
  if (Number.isInteger(idx) && items[idx - 1]) return items[idx - 1].url;
  throw new Error(`no queue item matches ${ref}`);
}

/** Manages the posting queue: enqueue refuses duplicates and blocked employers; `list` separates stale items. */
const command: Command = {
  name: "queue",
  summary: "Manage the posting queue: add, list, next, start, done, drop",
  usage: [
    "resumes queue add --url U [--company C] [--role R] [--source S] [--score N] [--person p]",
    "resumes queue list [--person p]",
    "resumes queue next [--person p]",
    "resumes queue start <url|#> [--person p]",
    "resumes queue done <url|#> --outcome submitted|skipped|held [--note TEXT] [--person p]",
    "resumes queue drop <url|#> [--note TEXT] [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest);
    const person = resolvePerson(flag(a, "person"));

    if (sub === "add") {
      const url = flag(a, "url");
      if (!url) throw new Error("queue add needs --url");
      const company = flag(a, "company");
      if (company && isBlocked(person, company)) {
        console.error(`${company} is blocked; see employers.md`);
        return 1;
      }
      const scoreStr = flag(a, "score");
      const result = enqueue(person, { url, company, role: flag(a, "role"), source: flag(a, "source"), score: scoreStr ? Number(scoreStr) : undefined });
      if (!result.added) {
        console.log(`not added: ${result.reason}`);
        return 0;
      }
      console.log(`queued ${result.item!.url}`);
      return 0;
    }

    if (sub === "list") {
      const { items } = loadQueue(person);
      const cfg = loadPipelineConfig();
      const open = items.filter((i) => i.status !== "done");
      const stale = open.filter((i) => daysSince(i.found) >= cfg.stale_queue_days);
      const fresh = open.filter((i) => daysSince(i.found) < cfg.stale_queue_days);
      console.log(`${fresh.length} queued, ${stale.length} stale (>=${cfg.stale_queue_days}d), ${items.length - open.length} done`);
      for (const i of fresh) console.log(fmt(i));
      if (stale.length) {
        console.log("-- stale --");
        for (const i of stale) console.log(fmt(i));
      }
      return 0;
    }

    if (sub === "next") {
      const item = nextItem(person);
      if (!item) {
        console.log("queue is empty");
        return 0;
      }
      console.log(fmt(item));
      return 0;
    }

    if (sub === "start" || sub === "done" || sub === "drop") {
      const ref = a._[0];
      if (!ref) throw new Error(`queue ${sub} needs <url|#>`);
      const { items } = loadQueue(person);
      const url = resolveUrl(items, ref);
      if (sub === "start") {
        updateItem(person, url, { status: "in-progress" });
        console.log(`started ${url}`);
        return 0;
      }
      if (sub === "done") {
        const outcome = flag(a, "outcome");
        if (!outcome || !["submitted", "skipped", "held"].includes(outcome)) throw new Error("queue done needs --outcome submitted|skipped|held");
        updateItem(person, url, { status: "done", outcome, note: flag(a, "note") });
        console.log(`done ${url} (${outcome})`);
        return 0;
      }
      updateItem(person, url, { status: "done", outcome: "dropped", note: flag(a, "note") });
      console.log(`dropped ${url}`);
      return 0;
    }

    console.error(`unknown queue subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
