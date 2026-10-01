// Story bank: people/<person>/stories.md, type "stories". Short Situation/Action/Result entries,
// keyed by id, tagged with the competencies they demonstrate. SSOT for written-answer anecdotes:
// drafts and interview prep pull from here instead of restating facts inline.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findOne, personDir, repoRoot } from "./repo.ts";
import { FILE_NAMES } from "./schema.ts";
import { similarity } from "./text.ts";

export type Story = { id: string; competencies: string[]; situation: string; action: string; result: string };

/** The person's stories file (found by type; the conventional path when absent). */
export function storiesPath(person: string, root = repoRoot()): string {
  return findOne(person, "stories", root) ?? join(personDir(person, root), FILE_NAMES.stories);
}

const FIELD = /^-\s*(Competencies|Situation|Action|Result)\s*:\s*(.*)$/i;

/** Parses the `### <id>` + field-line entries of a stories.md body. */
export function parseStories(body: string): Story[] {
  const out: Story[] = [];
  let current: Story | null = null;
  for (const line of body.split(/\r?\n/)) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = { id: h[1], competencies: [], situation: "", action: "", result: "" };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const f = FIELD.exec(line);
    if (!f) continue;
    const [, field, value] = f;
    if (/competencies/i.test(field)) current.competencies = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (/situation/i.test(field)) current.situation = value.trim();
    else if (/action/i.test(field)) current.action = value.trim();
    else if (/result/i.test(field)) current.result = value.trim();
  }
  return out;
}

/** All stories for a person; empty when they have no stories.md. */
export function listStories(person: string, root = repoRoot()): Story[] {
  const path = storiesPath(person, root);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return parseStories(body);
}

/** Stories whose competencies list contains (or loosely mention) the given competency. */
export function findStories(person: string, competency: string, root = repoRoot()): Story[] {
  const needle = competency.trim().toLowerCase();
  return listStories(person, root).filter((s) => s.competencies.some((c) => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase())));
}

/** Stories ranked by word-overlap with `text` (role, posting description, ...); all of them when `text` is empty. */
export function matchStories(stories: Story[], text: string, limit = 5): Story[] {
  if (!text.trim()) return stories.slice(0, limit);
  const scored = stories.map((s) => ({ s, score: similarity(text, `${s.competencies.join(" ")} ${s.situation} ${s.action} ${s.result}`) }));
  scored.sort((a, b) => b.score - a.score || a.s.id.localeCompare(b.s.id));
  return scored.slice(0, limit).map((x) => x.s);
}
