import { flag, has, parseArgs } from "../lib/args.ts";
import { describeApplication, findDuplicate } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { findEmployer } from "../lib/employers.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { enqueue, loadQueue, rankQueue, syncQueue, updateItem, type QueueItem } from "../lib/queue.ts";
import { rel, resolvePerson } from "../lib/repo.ts";
import { logEvent } from "../lib/runlog.ts";
import { DATE } from "../lib/schema.ts";
import { normalizeUrl } from "../lib/text.ts";

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - Date.parse(`${dateStr}T00:00:00`)) / 86400000);
}

function fmt(i: QueueItem): string {
  return `[${i.status}]${i.score !== undefined ? ` score=${i.score}` : ""} ${i.company ?? "?"} — ${i.role ?? "?"} (${i.posted ? `posted ${i.posted}, ` : ""}found ${i.found}) ${i.url}`;
}

function resolveUrl(items: QueueItem[], ref: string): string {
  const byUrl = items.find((i) => normalizeUrl(i.url) === normalizeUrl(ref));
  if (byUrl) return byUrl.url;
  const idx = Number(ref);
  if (Number.isInteger(idx) && items[idx - 1]) return items[idx - 1].url;
  throw new Error(`no queue item matches ${ref}`);
}

/**
 * Manages the posting queue: `add` refuses what is already queued or applied for and blocked employers; `next`
 * suggests an order with its reasons; `list` separates stale items. Both close items whose application moved on.
 */
const command: Command = {
  name: "queue",
  summary: "Manage the posting queue: add, list, next, start, done, drop",
  usage: [
    "resumes queue add --url U [--company C] [--role R] [--source S] [--posted YYYY-MM-DD] [--score N] [--pick] [--person p]",
    "resumes queue list [--person p]",
    "resumes queue next [--count N] [--person p]",
    "resumes queue skip --url U [--company C] [--role R] [--source S] --reason TEXT [--no-log] [--person p]",
    "resumes queue start <url|#> [--person p]",
    "resumes queue done <url|#> --outcome submitted|skipped|held [--note TEXT] [--person p]",
    "resumes queue drop <url|#> [--note TEXT] [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest, ["pick", "no-log"]);
    const person = resolvePerson(flag(a, "person"));

    if (sub === "add") {
      const url = flag(a, "url");
      if (!url) throw new Error("queue add needs --url");
      const company = flag(a, "company");
      const employer = company ? findEmployer(person, company) : null;
      if (employer?.blocked) {
        console.error(`${company} is blocked (employers list entry "${employer.company}"${employer.reason ? `: ${employer.reason}` : ""})`);
        return 1;
      }
      const posted = flag(a, "posted");
      if (posted && !DATE.test(posted)) throw new Error("--posted takes YYYY-MM-DD");
      const scoreStr = flag(a, "score");
      const result = enqueue(person, {
        url, company, role: flag(a, "role"), source: flag(a, "source"), score: scoreStr ? Number(scoreStr) : undefined,
        ...(posted ? { posted } : {}), ...(has(a, "pick") ? { pick: true } : {}),
      });
      if (!result.added) {
        console.log(result.reason === "queued"
          ? `not added: already queued (${result.item!.status}${result.item!.outcome ? `, ${result.item!.outcome}` : ""}) ${result.item!.url}`
          : `not added: already applied for, same ${result.match!.by}: ${rel(result.match!.app.dir)} (${describeApplication(result.match!.app)})`);
        return 0;
      }
      console.log(`queued ${result.item!.url}`);
      if (result.match) console.log(`  possible duplicate of ${rel(result.match.app.dir)} (${describeApplication(result.match.app)}): compare the postings before applying`);
      return 0;
    }

    if (sub === "skip") {
      // A posting ruled out from its listing or first lines needs no application directory: the queue keeps the
      // link and the reason, and `queue add` will not take it again.
      const url = flag(a, "url");
      const reason = flag(a, "reason");
      if (!url || !reason) throw new Error("queue skip needs --url and --reason");
      const company = flag(a, "company"), role = flag(a, "role");
      const added = enqueue(person, { url, company, role, source: flag(a, "source") });
      if (!added.added && added.reason === "applied") {
        console.log(`not skipped: already applied for, same ${added.match!.by}: ${rel(added.match!.app.dir)}`);
        return 0;
      }
      updateItem(person, added.item!.url, { status: "done", outcome: "skipped", note: reason });
      if (!has(a, "no-log")) logEvent(person, "skipped", `${company ?? "?"} — ${role ?? "?"}: ${reason} (${url})`);
      console.log(`skipped ${url}: ${reason}`);
      return 0;
    }

    if (sub === "list" || sub === "next") {
      const closed = syncQueue(person);
      if (closed) console.log(`closed ${closed} queue item(s) whose application was already submitted, held, or skipped`);
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
      // A suggested order with its reasons; any item may be taken first when there is a reason to.
      const count = Math.max(1, Number(flag(a, "count") ?? 1) || 1);
      const ranked = rankQueue(person).slice(0, count);
      if (!ranked.length) {
        console.log("queue is empty");
        return 0;
      }
      for (const { item, why } of ranked) {
        console.log(`${fmt(item)}\n  why: ${why.join(", ")}`);
        const app = findDuplicate(person, { url: item.url, source: item.source });
        if (app) console.log(`  application: ${rel(app.app.dir)} (${app.app.record?.status ?? "no record"}): continue it rather than starting another`);
      }
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
