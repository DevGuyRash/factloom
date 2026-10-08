import { existsSync } from "node:fs";
import { join } from "node:path";
import { readDoc, writeDoc } from "./frontmatter.ts";
import { findDuplicate, listApplications, type Application, type DuplicateMatch, type Record_ } from "./applications.ts";
import { findEmployer } from "./employers.ts";
import { loadPipelineConfig } from "./pipeline-config.ts";
import { findOne, personDir, repoRoot, today } from "./repo.ts";
import { FILE_NAMES, QUEUE_STATUS } from "./schema.ts";
import { normalizeUrl } from "./text.ts";

export type QueueStatus = (typeof QUEUE_STATUS)[number];
export type QueueItem = {
  url: string; company?: string; role?: string; source?: string; found: string; status: QueueStatus;
  score?: number; outcome?: string; note?: string; application?: string; posted?: string; pick?: boolean;
  /** The catalog id of the answer or constraint that ruled the posting out, so a changed answer finds it. */
  rule?: string;
  /** The last day the posting accepts applications (YYYY-MM-DD), when it states one. */
  closes?: string;
};
type QueueDoc = { type: "queue"; person: string; items: QueueItem[] };

/** The person's queue file (found by type; created at the conventional path when absent). */
export function queuePath(person: string, root = repoRoot()): string {
  return findOne(person, "queue", root) ?? join(personDir(person, root), FILE_NAMES.queue);
}

export function loadQueue(person: string, root = repoRoot()): { path: string; items: QueueItem[]; body: string } {
  const path = queuePath(person, root);
  if (!existsSync(path)) return { path, items: [], body: "\n# Queue\n\nPostings found but not yet worked. `resumes queue next` suggests an order; the agent may work them in any order. Managed by `resumes queue`.\n" };
  const { data, body } = readDoc<QueueDoc>(path);
  return { path, items: Array.isArray(data.items) ? data.items : [], body };
}

export function saveQueue(person: string, items: QueueItem[], root = repoRoot()): string {
  const { path, body } = loadQueue(person, root);
  writeDoc(path, { type: "queue", person, items }, body);
  return path;
}

export type AddResult = { added: boolean; reason?: "queued" | "applied"; item?: QueueItem; match?: DuplicateMatch };

/**
 * Adds a posting unless it is already queued or already applied for (the same link, or the same requisition).
 * A posting whose company and title only resemble an earlier application is added, with `match` naming it.
 */
export function enqueue(person: string, item: Omit<QueueItem, "found" | "status"> & Partial<Pick<QueueItem, "found" | "status">>, root = repoRoot()): AddResult {
  const { items } = loadQueue(person, root);
  const keys = [item.url, item.source].filter((u): u is string => !!u).map(normalizeUrl);
  const existing = items.find((i) => [i.url, i.source].some((u) => u && keys.includes(normalizeUrl(u))));
  if (existing) return { added: false, reason: "queued", item: existing };
  const match = findDuplicate(person, { company: item.company, role: item.role, url: item.url, source: item.source }, root);
  if (match && match.by !== "title") return { added: false, reason: "applied", match };
  const next: QueueItem = { found: today(), status: "queued", ...item, url: item.url };
  saveQueue(person, [...items, next], root);
  return { added: true, item: next, ...(match ? { match } : {}) };
}

const SENT = new Set(["submitted", "rejected", "interviewing", "offer", "closed", "withdrawn"]);
const outcomeOf = (status: string) => (status === "blocked" ? "held" : SENT.has(status) ? "submitted" : status);

/** The open queue items for one application record: those whose link is the record's employer link or its job-board link. */
function itemsFor(items: QueueItem[], record: Pick<Record_, "url" | "source">): number[] {
  const keys = [record.url, record.source].filter(Boolean).map((u) => normalizeUrl(String(u)));
  return items.flatMap((q, i) => (q.status !== "done" && [q.url, q.source].some((u) => u && keys.includes(normalizeUrl(u))) ? [i] : []));
}

/** Updates the queue items for an application record (submit, hold, skip, or a new score); returns how many changed. */
export function updateFor(person: string, record: Pick<Record_, "url" | "source">, patch: Partial<QueueItem>, root = repoRoot()): number {
  const { items } = loadQueue(person, root);
  const hits = itemsFor(items, record);
  for (const i of hits) items[i] = { ...items[i], ...patch };
  if (hits.length) saveQueue(person, items, root);
  return hits.length;
}

/**
 * Closes open queue items whose application already moved on (submitted, held, or skipped) but whose queue entry was
 * never updated, so they stop coming back. Returns how many it closed.
 */
export function syncQueue(person: string, root = repoRoot(), apps: Application[] = listApplications(person, root)): number {
  const { items } = loadQueue(person, root);
  let closed = 0;
  // A posting whose own close date has passed accepts no more applications: closed as skipped, with the date as the reason.
  const todayStr = today();
  for (const [i, item] of items.entries()) {
    if (item.status === "queued" && item.closes && item.closes < todayStr) {
      items[i] = { ...item, status: "done", outcome: "skipped", note: `close date ${item.closes} passed` };
      closed++;
    }
  }
  for (const app of apps) {
    const r = app.record;
    if (!r || r.status === "drafted") continue;
    for (const i of itemsFor(items, r)) {
      items[i] = { ...items[i], status: "done", outcome: outcomeOf(r.status), application: app.name };
      closed++;
    }
  }
  if (closed) saveQueue(person, items, root);
  return closed;
}

export type Ranked = { item: QueueItem; why: string[] };

const daysSince = (date: string) => Math.floor((Date.now() - Date.parse(`${date}T00:00:00`)) / 86400000);

/**
 * The open items in a suggested order, each with why it is there: work already in progress, then the person's own
 * picks and priority employers, then the rest; within each, postings about to close first (soonest first), then fresh
 * before stale; higher scores, then newer postings, first. The order is a default: the agent may take any item when it
 * has a reason.
 */
export function rankQueue(person: string, root = repoRoot()): Ranked[] {
  const { items } = loadQueue(person, root);
  const cfg = loadPipelineConfig(root);
  const staleDays = cfg.stale_queue_days;
  const todayStr = today();
  const ranked = items.filter((i) => i.status !== "done").map((item) => {
    const why: string[] = [];
    if (item.status === "in-progress") why.push("in progress");
    if (item.pick) why.push("the person's pick");
    const priority = item.company ? findEmployer(person, item.company, root)?.priority === true : false;
    if (priority) why.push("priority employer");
    const age = daysSince(item.posted ?? item.found);
    const stale = daysSince(item.found) >= staleDays;
    if (item.score !== undefined) why.push(`score ${item.score}`);
    why.push(item.posted ? `posted ${item.posted}` : `found ${item.found}`);
    if (stale) why.push("stale");
    // Days until the posting stops accepting applications; only a close date within reach changes the order.
    const toClose = item.closes ? Math.round((Date.parse(`${item.closes}T00:00:00`) - Date.parse(`${todayStr}T00:00:00`)) / 86400000) : undefined;
    const closing = toClose !== undefined && toClose >= 0 && toClose <= cfg.closing_soon_days ? toClose : undefined;
    if (item.closes) why.push(closing === undefined ? `closes ${item.closes}` : `closes ${item.closes} (${closing === 0 ? "today" : `in ${closing} day${closing === 1 ? "" : "s"}`})`);
    const tier = item.status === "in-progress" ? 0 : item.pick || priority ? 1 : 2;
    return { item, why, tier, stale, age, closing };
  });
  ranked.sort((a, b) => a.tier - b.tier || (a.closing ?? Infinity) - (b.closing ?? Infinity) || Number(a.stale) - Number(b.stale) || (b.item.score ?? -1) - (a.item.score ?? -1) || a.age - b.age);
  return ranked.map(({ item, why }) => ({ item, why }));
}

/** The first item of `rankQueue`. */
export function nextItem(person: string, root = repoRoot()): QueueItem | null {
  return rankQueue(person, root)[0]?.item ?? null;
}

export function updateItem(person: string, url: string, patch: Partial<QueueItem>, root = repoRoot()): QueueItem | null {
  const { items } = loadQueue(person, root);
  const key = normalizeUrl(url);
  const i = items.findIndex((x) => normalizeUrl(x.url) === key);
  if (i < 0) return null;
  items[i] = { ...items[i], ...patch };
  saveQueue(person, items, root);
  return items[i];
}

/** Skipped postings and applications ruled out under one catalog id (or every rule, keyed by id, when none is given). */
export function skipsByRule(person: string, root = repoRoot()): Map<string, { queue: QueueItem[]; apps: Application[] }> {
  const out = new Map<string, { queue: QueueItem[]; apps: Application[] }>();
  const slot = (rule: string) => out.get(rule) ?? out.set(rule, { queue: [], apps: [] }).get(rule)!;
  const apps = listApplications(person, root);
  for (const i of loadQueue(person, root).items) {
    if (i.outcome !== "skipped") continue;
    // A skipped application has its own record; count it there, once.
    if (i.application && apps.some((x) => x.name === i.application && x.record?.status === "skipped")) continue;
    slot(i.rule ?? "").queue.push(i);
  }
  for (const app of apps) if (app.record?.status === "skipped") slot(String(app.record.skip_rule ?? "")).apps.push(app);
  return out;
}
