import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readDoc, writeDoc } from "./frontmatter.ts";
import { findOne, personDir, repoRoot, stamp, today } from "./repo.ts";

export { stamp };
import { FILE_NAMES } from "./schema.ts";

export type SearchItem = {
  id: string; variant?: string; site?: string; url: string; query?: string; filters?: string;
  every_days: number; last_run?: string | null;
  /** What the last run turned up, and every run's new postings added up: how productive the search is. */
  last_found?: number; last_new?: number; runs?: number; new_total?: number;
  /** A search set aside (nothing new for a while, a broken page) until this date. */
  paused_until?: string; paused_reason?: string;
};
/** A site left alone until a time (a rate limit, a bot check, a warning), so later activations know too. */
export type ClosedSite = { site: string; until: string; reason?: string };
/** A pass is one turn through every open search; `pass_new` counts the new postings it found so far. */
export type LastPass = { started: string; ended: string; searches: number; new: number };
export type SearchesDoc = {
  type: "searches"; person: string; items: SearchItem[];
  pass_started?: string; pass_new?: number; last_pass?: LastPass; closed_sites?: ClosedSite[];
};

const BODY = "\n# Saved searches\n\nOne for each target title on each job site. `resumes searches next` suggests the next ones, the ones run longest ago first; `searches mark` records each run and counts the pass; `every_days` says when one is due again between sessions. Managed by `resumes searches`.\n";

/** The person's saved-searches file (found by type; the conventional path when absent). */
export function searchesPath(person: string, root = repoRoot()): string {
  return findOne(person, "searches", root) ?? join(personDir(person, root), FILE_NAMES.searches);
}

export function loadSearchesDoc(person: string, root = repoRoot()): { path: string; data: SearchesDoc; body: string } {
  const path = searchesPath(person, root);
  if (!existsSync(path)) return { path, data: { type: "searches", person, items: [] }, body: BODY };
  const { data, body } = readDoc<SearchesDoc>(path);
  return { path, data: { ...data, type: "searches", person, items: Array.isArray(data.items) ? data.items : [] }, body };
}

export function loadSearches(person: string, root = repoRoot()): { path: string; items: SearchItem[]; body: string } {
  const { path, data, body } = loadSearchesDoc(person, root);
  return { path, items: data.items, body };
}

function saveDoc(person: string, data: SearchesDoc, root = repoRoot()): string {
  const { path, body } = loadSearchesDoc(person, root);
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  writeDoc(path, clean, body);
  return path;
}

export function saveSearches(person: string, items: SearchItem[], root = repoRoot()): string {
  return saveDoc(person, { ...loadSearchesDoc(person, root).data, items }, root);
}

/**
 * Milliseconds for a stamp: a date with time and offset (what `mark` writes), a date and time without one (local),
 * or a bare date (local midnight). Never run is -Infinity.
 */
export function timeOf(stamp: string | null | undefined): number {
  if (!stamp) return -Infinity;
  const s = String(stamp);
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(t) ? -Infinity : t;
}


/** Days from a `last_run` to today, by local calendar day. */
function daysSince(last: string): number {
  const day = new Date(timeOf(last)).toLocaleDateString("en-CA");
  return Math.floor((Date.parse(`${today()}T00:00:00`) - Date.parse(`${day}T00:00:00`)) / 86400000);
}

/** Searches never run, or not run within their own `every_days`. */
export function dueSearches(person: string, root = repoRoot()): SearchItem[] {
  return loadSearches(person, root).items.filter((s) => !s.last_run || daysSince(s.last_run) >= s.every_days);
}

const siteOf = (s: { site?: string }) => String(s.site ?? "").trim().toLowerCase();

/** Sites closed now, and searches paused now. */
export function closures(doc: SearchesDoc, now = Date.now()): { closed: ClosedSite[]; paused: SearchItem[] } {
  return {
    closed: (doc.closed_sites ?? []).filter((c) => timeOf(c.until) > now),
    paused: doc.items.filter((s) => s.paused_until && timeOf(s.paused_until) > now),
  };
}

/** The searches the rotation can take now: not paused, and not on a site closed for now. */
export function openSearches(doc: SearchesDoc, now = Date.now()): SearchItem[] {
  const { closed, paused } = closures(doc, now);
  const closedSites = new Set(closed.map(siteOf));
  return doc.items.filter((s) => !paused.includes(s) && !closedSites.has(siteOf(s)));
}

/**
 * Open searches in rotation order, whatever their `every_days`: the ones run longest ago first (never-run ones
 * first, then in file order). Among searches that ran equally long ago, one on a different site from the search
 * before it comes first, so a first pass alternates sites and later passes keep that order. The order is a
 * default: the agent may take another search when it has a reason (yields, a site's posting rhythm).
 */
export function rotation(person: string, root = repoRoot(), now = Date.now()): SearchItem[] {
  const doc = loadSearchesDoc(person, root).data;
  const open = openSearches(doc, now);
  const sorted = [...open].sort((a, b) => timeOf(a.last_run) - timeOf(b.last_run));
  const latest = doc.items.reduce<SearchItem | null>((a, b) => (b.last_run && (!a || timeOf(b.last_run) > timeOf(a.last_run)) ? b : a), null);
  const out: SearchItem[] = [];
  let previous = latest ? siteOf(latest) : "";
  while (sorted.length) {
    const t = timeOf(sorted[0].last_run);
    const i = sorted.findIndex((s) => timeOf(s.last_run) === t && siteOf(s) !== previous);
    const [pick] = sorted.splice(i >= 0 ? i : 0, 1);
    out.push(pick);
    previous = siteOf(pick);
  }
  return out;
}

/** The first search of the rotation. */
export function nextSearch(person: string, root = repoRoot()): SearchItem | null {
  return rotation(person, root)[0] ?? null;
}

/** Where the current pass stands: open searches run since it began, of all open ones, and new postings so far. */
export function passStatus(doc: SearchesDoc, now = Date.now()): { started?: string; ran: number; open: number; new: number; complete: boolean } {
  const open = openSearches(doc, now);
  const started = doc.pass_started;
  const ran = started ? open.filter((s) => timeOf(s.last_run) >= timeOf(started)).length : 0;
  return { started, ran, open: open.length, new: doc.pass_new ?? 0, complete: !!started && open.length > 0 && ran === open.length };
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

export function removeSearch(person: string, id: string, root = repoRoot()): SearchItem | null {
  const { items } = loadSearches(person, root);
  const gone = items.find((s) => s.id === id) ?? null;
  if (gone) saveSearches(person, items.filter((s) => s !== gone), root);
  return gone;
}

/**
 * Records that a search ran now, with what it found when given, and counts it toward the current pass. A run
 * when no pass is going starts one. The run that completes a pass closes it: `completed` reports it, and the
 * next run starts a new pass.
 */
export function markSearch(person: string, id: string, root = repoRoot(), result: { found?: number; new?: number } = {}): { item: SearchItem; completed?: LastPass; doc: SearchesDoc } | null {
  const { data } = loadSearchesDoc(person, root);
  const i = data.items.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const now = stamp();
  const prev = data.items[i];
  data.items[i] = {
    ...prev, last_run: now,
    ...(result.found !== undefined ? { last_found: result.found } : {}),
    ...(result.new !== undefined ? { last_new: result.new, runs: (prev.runs ?? 0) + 1, new_total: (prev.new_total ?? 0) + result.new } : {}),
  };
  if (!data.pass_started) Object.assign(data, { pass_started: now, pass_new: 0 });
  data.pass_new = (data.pass_new ?? 0) + (result.new ?? 0);
  const status = passStatus(data);
  let completed: LastPass | undefined;
  if (status.complete) {
    completed = { started: data.pass_started!, ended: now, searches: status.open, new: data.pass_new };
    Object.assign(data, { last_pass: completed, pass_started: undefined, pass_new: undefined });
  }
  saveDoc(person, data, root);
  return { item: data.items[i], completed, doc: data };
}

/** Sets a search aside until a date, or brings it back (`until` null). */
export function pauseSearch(person: string, id: string, until: string | null, reason: string | undefined, root = repoRoot()): SearchItem | null {
  const { data } = loadSearchesDoc(person, root);
  const i = data.items.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const { paused_until: _u, paused_reason: _r, ...rest } = data.items[i];
  data.items[i] = until ? { ...rest, paused_until: until, ...(reason ? { paused_reason: reason } : {}) } : rest;
  saveDoc(person, data, root);
  return data.items[i];
}

/** Closes a site until a time, or reopens it (`until` null). Expired closures are dropped as they pass. */
export function closeSite(person: string, site: string, until: string | null, reason: string | undefined, root = repoRoot()): ClosedSite[] {
  const { data } = loadSearchesDoc(person, root);
  const now = Date.now();
  const kept = (data.closed_sites ?? []).filter((c) => siteOf(c) !== site.trim().toLowerCase() && timeOf(c.until) > now);
  data.closed_sites = until ? [...kept, { site, until, ...(reason ? { reason } : {}) }] : kept;
  if (!data.closed_sites.length) delete data.closed_sites;
  saveDoc(person, data, root);
  return data.closed_sites ?? [];
}
