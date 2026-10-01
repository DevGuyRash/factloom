// Where shared assets come from. Three layers, most specific first:
//   1. a person's own overrides     people/<person>/templates/...
//   2. the repository's own layer   custom/...            (yours; engine updates never touch it)
//   3. the engine's defaults        shared/...            (engine-owned; updated by `resumes update`)
// A file in an earlier layer replaces the same file in a later one; data files (pipeline.yaml,
// lexicon.yaml, the onboarding catalog, pii-allow.yaml) merge instead, so custom/ adds to the defaults.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { personDir, repoRoot } from "./repo.ts";

/** The checkout holding these tools (its shared/ is the default layer even when RESUMES_ROOT points elsewhere). */
export const engineRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const customDir = (root = repoRoot()): string => join(root, "custom");

const unique = (dirs: string[]): string[] => [...new Set(dirs.map((d) => resolve(d)))];

/**
 * The shared/ directories to read defaults from: the running engine's own first, so defaults always
 * match the code that reads them, also when it runs against another copy (RESUMES_ROOT pointing at a
 * person's repository to try an engine change on their data). A data root's own shared/ only supplies
 * files this engine lacks, such as a test fixture's.
 */
export function sharedDirs(root = repoRoot()): string[] {
  return unique([join(engineRoot(), "shared"), join(root, "shared")]);
}

/**
 * Directories to search for one kind of asset, most specific first. `sub` is the path under shared/
 * and custom/ (such as `templates/themes`); `personSub` is the path under people/<person>/ when it
 * differs (document templates live directly in people/<person>/templates/).
 */
export function searchDirs(sub: string, root = repoRoot(), person?: string, personSub = sub.replace(/^templates\/documents$/, "templates")): string[] {
  return unique([
    ...(person ? [join(personDir(person, root), personSub)] : []),
    join(customDir(root), sub),
    ...sharedDirs(root).map((d) => join(d, sub)),
  ]);
}

/** The first existing file named `file` across `dirs`, or undefined. */
export function firstExisting(dirs: string[], file: string): string | undefined {
  for (const d of dirs) {
    const p = join(d, file);
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** A shared data file in merge order (defaults first, then custom/), keeping only files that exist. */
export function dataLayers(file: string, root = repoRoot()): string[] {
  const shared = firstExisting(sharedDirs(root), file);
  const custom = join(customDir(root), file);
  return [...(shared ? [shared] : []), ...(existsSync(custom) ? [custom] : [])];
}
