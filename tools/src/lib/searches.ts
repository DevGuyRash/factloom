import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readDoc, writeDoc } from "./frontmatter.ts";
import { findOne, personDir, repoRoot, today } from "./repo.ts";
import { FILE_NAMES } from "./schema.ts";

export type SearchItem = {
  id: string; variant?: string; site?: string; url: string; query?: string; filters?: string;
  every_days: number; last_run?: string | null;
};
type SearchesDoc = { type: "searches"; person: string; items: SearchItem[] };

/** The person's saved-searches file (found by type; the conventional path when absent). */
export function searchesPath(person: string, root = repoRoot()): string {
  return findOne(person, "searches", root) ?? join(personDir(person, root), FILE_NAMES.searches);
}

export function loadSearches(person: string, root = repoRoot()): { path: string; items: SearchItem[]; body: string } {
  const path = searchesPath(person, root);
  if (!existsSync(path)) {
    return { path, items: [], body: "\n# Saved searches\n\nOne for each target title on each job site. `resumes searches next` takes them in turn, the one run longest ago first; `every_days` says when one is due again between sessions. Managed by `resumes searches`.\n" };
  }
  const { data, body } = readDoc<SearchesDoc>(path);
  return { path, items: Array.isArray(data.items) ? data.items : [], body };
}

export function saveSearches(person: string, items: SearchItem[], root = repoRoot()): string {
  const { path, body } = loadSearches(person, root);
  writeDoc(path, { type: "searches", person, items }, body);
  return path;
}

/** Days from a `last_run` (a date, or a date and time) to today, by calendar day. */
function daysSince(stamp: string): number {
  return Math.floor((Date.parse(`${today()}T00:00:00`) - Date.parse(`${String(stamp).slice(0, 10)}T00:00:00`)) / 86400000);
}

/** Local date and time to the minute (YYYY-MM-DDTHH:MM): sorts as text, and days still count by its date. */
function nowStamp(): string {
  const d = new Date();
  return `${today()}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Searches never run, or not run within their own `every_days`. */
export function dueSearches(person: string, root = repoRoot()): SearchItem[] {
  return loadSearches(person, root).items.filter((s) => !s.last_run || daysSince(s.last_run) >= s.every_days);
}

/**
 * The next saved search in a long run's rotation, whatever its `every_days`: the one run longest ago (never-run
 * ones first, then in file order). Among searches that ran equally long ago, one on a different site from the
 * search run last comes first, so a first pass alternates sites and later passes keep that order. Each search
 * picks up what was posted since it last ran. `skipSites` leaves out sites that stopped the run for the day.
 */
export function nextSearch(person: string, root = repoRoot(), skipSites: string[] = []): SearchItem | null {
  const items = loadSearches(person, root).items;
  const site = (s: SearchItem) => String(s.site ?? "").trim().toLowerCase();
  const at = (s: SearchItem) => (s.last_run ? String(s.last_run) : "");
  const skip = new Set(skipSites.map((x) => x.trim().toLowerCase()).filter(Boolean));
  const open = items.filter((s) => !skip.has(site(s)));
  if (!open.length) return null;
  const oldest = open.reduce((a, b) => (at(b) < at(a) ? b : a));
  const latest = items.reduce<SearchItem | null>((a, b) => (at(b) && (!a || at(b) > at(a)) ? b : a), null);
  const elsewhere = latest ? open.find((s) => at(s) === at(oldest) && site(s) !== site(latest)) : undefined;
  return elsewhere ?? oldest;
}

/**
 * Saves a new search. Refuses an id already taken, a search another one already runs (the same URL, query, and
 * filters would find the same postings twice; sites that keep the query out of the URL share one URL), and a
 * variant that is not an active resume.
 */
export function addSearch(person: string, item: SearchItem, root = repoRoot()): SearchItem {
  const { items } = loadSearches(person, root);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(item.id)) throw new Error(`search id ${item.id}: use lowercase letters, digits, and - . _`);
  if (items.some((s) => s.id === item.id)) throw new Error(`a search ${item.id} exists already`);
  const key = (s: SearchItem) => [s.url, s.query ?? "", s.filters ?? ""].map((v) => String(v).trim().toLowerCase()).join("\n");
  const same = items.find((s) => key(s) === key(item));
  if (same) throw new Error(`search ${same.id} already runs ${item.url}${item.query ? ` for "${item.query}"` : ""}`);
  if (item.variant) {
    const active = join(personDir(person, root), "resumes", "active");
    const variants = existsSync(active) ? readdirSync(active, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
    if (!variants.includes(item.variant)) throw new Error(`no active resume ${item.variant} (active: ${variants.join(", ") || "none"})`);
  }
  if (!Number.isInteger(item.every_days) || item.every_days < 1) throw new Error("--every-days takes a whole number of days, 1 or more");
  const saved: SearchItem = Object.fromEntries(Object.entries({ ...item, last_run: null }).filter(([, v]) => v !== undefined)) as SearchItem;
  saveSearches(person, [...items, saved], root);
  return saved;
}

/** Records that a search ran now (date and time, so searches run on the same day still rotate in order). */
export function markSearch(person: string, id: string, root = repoRoot()): SearchItem | null {
  const { items } = loadSearches(person, root);
  const i = items.findIndex((s) => s.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], last_run: nowStamp() };
  saveSearches(person, items, root);
  return items[i];
}
