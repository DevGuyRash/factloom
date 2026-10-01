import { existsSync } from "node:fs";
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
    return { path, items: [], body: "\n# Saved searches\n\nEach runs on its own cadence (`every_days`). Managed by `resumes searches`.\n" };
  }
  const { data, body } = readDoc<SearchesDoc>(path);
  return { path, items: Array.isArray(data.items) ? data.items : [], body };
}

export function saveSearches(person: string, items: SearchItem[], root = repoRoot()): string {
  const { path, body } = loadSearches(person, root);
  writeDoc(path, { type: "searches", person, items }, body);
  return path;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.parse(`${today()}T00:00:00`) - Date.parse(`${dateStr}T00:00:00`)) / 86400000);
}

/** Searches never run, or not run within their own `every_days`. */
export function dueSearches(person: string, root = repoRoot()): SearchItem[] {
  return loadSearches(person, root).items.filter((s) => !s.last_run || daysSince(s.last_run) >= s.every_days);
}

export function markSearch(person: string, id: string, root = repoRoot()): SearchItem | null {
  const { items } = loadSearches(person, root);
  const i = items.findIndex((s) => s.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], last_run: today() };
  saveSearches(person, items, root);
  return items[i];
}
