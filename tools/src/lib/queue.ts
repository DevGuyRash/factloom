import { existsSync } from "node:fs";
import { join } from "node:path";
import { readDoc, writeDoc } from "./frontmatter.ts";
import { findDuplicate } from "./applications.ts";
import { findOne, personDir, repoRoot, today } from "./repo.ts";
import { FILE_NAMES, QUEUE_STATUS } from "./schema.ts";
import { normalizeUrl } from "./text.ts";

export type QueueStatus = (typeof QUEUE_STATUS)[number];
export type QueueItem = {
  url: string; company?: string; role?: string; source?: string; found: string; status: QueueStatus;
  score?: number; outcome?: string; note?: string; application?: string;
};
type QueueDoc = { type: "queue"; person: string; items: QueueItem[] };

/** The person's queue file (found by type; created at the conventional path when absent). */
export function queuePath(person: string, root = repoRoot()): string {
  return findOne(person, "queue", root) ?? join(personDir(person, root), FILE_NAMES.queue);
}

export function loadQueue(person: string, root = repoRoot()): { path: string; items: QueueItem[]; body: string } {
  const path = queuePath(person, root);
  if (!existsSync(path)) return { path, items: [], body: "\n# Queue\n\nPostings found but not yet worked, oldest first. Managed by `resumes queue`.\n" };
  const { data, body } = readDoc<QueueDoc>(path);
  return { path, items: Array.isArray(data.items) ? data.items : [], body };
}

export function saveQueue(person: string, items: QueueItem[], root = repoRoot()): string {
  const { path, body } = loadQueue(person, root);
  writeDoc(path, { type: "queue", person, items }, body);
  return path;
}

export type AddResult = { added: boolean; reason?: "queued" | "applied"; item?: QueueItem };

/** Adds a posting unless it is already queued or already has an application record. */
export function enqueue(person: string, item: Omit<QueueItem, "found" | "status"> & Partial<Pick<QueueItem, "found" | "status">>, root = repoRoot()): AddResult {
  const { items } = loadQueue(person, root);
  const url = normalizeUrl(item.url);
  const existing = items.find((i) => normalizeUrl(i.url) === url);
  if (existing) return { added: false, reason: "queued", item: existing };
  if (findDuplicate(person, { company: item.company, role: item.role, url: item.url }, root)) return { added: false, reason: "applied" };
  const next: QueueItem = { found: today(), status: "queued", ...item, url: item.url };
  saveQueue(person, [...items, next], root);
  return { added: true, item: next };
}

/** The next posting to work: an in-progress item first (a run that stopped mid-way), then the best-scored or oldest queued. */
export function nextItem(person: string, root = repoRoot()): QueueItem | null {
  const { items } = loadQueue(person, root);
  const inProgress = items.find((i) => i.status === "in-progress");
  if (inProgress) return inProgress;
  const queued = items.filter((i) => i.status === "queued");
  queued.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.found.localeCompare(b.found));
  return queued[0] ?? null;
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
