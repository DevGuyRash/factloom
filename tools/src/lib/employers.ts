import { existsSync } from "node:fs";
import { join } from "node:path";
import { readDoc, writeDoc } from "./frontmatter.ts";
import { findOne, personDir, repoRoot } from "./repo.ts";
import { FILE_NAMES } from "./schema.ts";
import { normalizeCompany, sameEmployer } from "./text.ts";

export type EmployerItem = { company: string; blocked?: boolean; reason?: string; priority?: boolean; notes?: string };
type EmployersDoc = { type: "employers"; person: string; items: EmployerItem[] };

/** The person's employers file (found by type; the conventional path when absent). */
export function employersPath(person: string, root = repoRoot()): string {
  return findOne(person, "employers", root) ?? join(personDir(person, root), FILE_NAMES.employers);
}

export function loadEmployers(person: string, root = repoRoot()): { path: string; items: EmployerItem[]; body: string } {
  const path = employersPath(person, root);
  if (!existsSync(path)) {
    return { path, items: [], body: "\n# Employers\n\nScreening notes: blocked employers and priority targets. Managed by `resumes employers`.\n" };
  }
  const { data, body } = readDoc<EmployersDoc>(path);
  return { path, items: Array.isArray(data.items) ? data.items : [], body };
}

export function saveEmployers(person: string, items: EmployerItem[], root = repoRoot()): string {
  const { path, body } = loadEmployers(person, root);
  writeDoc(path, { type: "employers", person, items }, body);
  return path;
}


/**
 * The employer record `name` refers to: the same name (via normalizeCompany), else one whose name
 * is a shorter or longer form of it by whole leading words, so a block on "SWCA Environmental
 * Consultants" also catches "SWCA" (while "Meta" does not catch "Metabolic Labs"). Null when none.
 */
export function findEmployer(person: string, name: string, root = repoRoot()): EmployerItem | null {
  const key = normalizeCompany(name);
  const items = loadEmployers(person, root).items;
  return items.find((e) => normalizeCompany(e.company) === key) ?? items.find((e) => sameEmployer(e.company, name)) ?? null;
}

export const isBlocked = (person: string, name: string, root = repoRoot()): boolean => findEmployer(person, name, root)?.blocked === true;

function upsert(person: string, name: string, patch: Partial<EmployerItem>, root = repoRoot()): EmployerItem {
  const { items } = loadEmployers(person, root);
  const key = normalizeCompany(name);
  const i = items.findIndex((e) => normalizeCompany(e.company) === key);
  const next = i < 0 ? { company: name, ...patch } : { ...items[i], ...patch };
  if (i < 0) items.push(next);
  else items[i] = next;
  saveEmployers(person, items, root);
  return next;
}

export const blockEmployer = (person: string, name: string, reason: string | undefined, root = repoRoot()): EmployerItem =>
  upsert(person, name, { blocked: true, ...(reason ? { reason } : {}) }, root);

export const priorityEmployer = (person: string, name: string, root = repoRoot()): EmployerItem => upsert(person, name, { priority: true }, root);
