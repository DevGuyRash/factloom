import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { peek } from "./frontmatter.ts";
import type { DocType } from "./schema.ts";

/** Repository root: RESUMES_ROOT when set (tests, other checkouts), else the checkout holding these tools. */
export function repoRoot(): string {
  if (process.env.RESUMES_ROOT) return resolve(process.env.RESUMES_ROOT);
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "AGENTS.md")) && existsSync(join(dir, "people"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not find the repository root (a directory with AGENTS.md and people/)");
}

export const peopleDir = (root = repoRoot()) => join(root, "people");
export const sharedDir = (root = repoRoot()) => join(root, "shared");
export const personDir = (person: string, root = repoRoot()) => join(peopleDir(root), person);

export function listPeople(root = repoRoot()): string[] {
  const dir = peopleDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort();
}

const SKIP_DIRS = new Set(["node_modules", ".git", "archive"]);

/** Every Markdown file under `dir` (skipping dependencies and archives). */
export function walkMarkdown(dir: string, opts: { includeArchive?: boolean } = {}): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        if (!opts.includeArchive && SKIP_DIRS.has(e.name)) continue;
        walk(p);
      } else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Markdown files under `dir` whose frontmatter `type` matches. */
export function findByType(dir: string, type: DocType): string[] {
  return walkMarkdown(dir).filter((p) => peek(p)?.type === type);
}

/** The single document of `type` in a person's directory, or null. */
export function findOne(person: string, type: DocType, root = repoRoot()): string | null {
  const hits = findByType(personDir(person, root), type);
  return hits.length ? hits[0] : null;
}

/** The person whose directory contains `path` (the segment after the nearest `people`). */
export function personOf(path: string): { person: string; dir: string } {
  const parts = resolve(path).split(sep);
  const i = parts.lastIndexOf("people");
  if (i < 0 || i + 1 >= parts.length) throw new Error(`${path}: not under people/<person>/`);
  return { person: parts[i + 1], dir: parts.slice(0, i + 2).join(sep) };
}

export const rel = (path: string, root = repoRoot()) => relative(root, path);
export const today = () => new Date().toLocaleDateString("en-CA");

/** The person a command acts for: the explicit slug, else the only profile with `apply: enabled`. */
export function resolvePerson(explicit: string | undefined, root = repoRoot()): string {
  if (explicit) {
    if (!existsSync(personDir(explicit, root))) throw new Error(`no person directory people/${explicit}`);
    return explicit;
  }
  const enabled = listPeople(root).filter((p) => findByType(personDir(p, root), "profile").some((f) => peek(f)?.apply === "enabled"));
  if (enabled.length === 1) return enabled[0];
  throw new Error(enabled.length ? `several people have apply: enabled (${enabled.join(", ")}); pass --person` : "no profile has apply: enabled; pass --person");
}
