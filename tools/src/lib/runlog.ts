import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { peek, readDoc, writeDoc } from "./frontmatter.ts";
import { personDir, repoRoot } from "./repo.ts";
import { renderTemplate } from "./templates.ts";

export type RunCounts = { submitted: number; held: number; skipped: number; errors: number };
export type RunLogDoc = { type: "run-log"; person: string; started: string; ended?: string; status: "running" | "finished"; counts: RunCounts };

export const runsDir = (person: string, root = repoRoot()) => join(personDir(person, root), "runs");

function stamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Every run log of a person, oldest first. */
export function listRuns(person: string, root = repoRoot()): string[] {
  const dir = runsDir(person, root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f));
}

/** The most recent run log still `status: running`, or null. */
export function currentRun(person: string, root = repoRoot()): string | null {
  const runs = [...listRuns(person, root)].reverse();
  return runs.find((p) => peek(p)?.status === "running") ?? null;
}

/** A run log still `running` that was written to within `minutes`: another activation at work. */
export function activeRun(person: string, minutes: number, root = repoRoot(), now = Date.now()): { path: string; lastWrite: Date } | null {
  const path = currentRun(person, root);
  if (!path) return null;
  const lastWrite = statSync(path).mtime;
  return now - lastWrite.getTime() < minutes * 60000 ? { path, lastWrite } : null;
}

/**
 * Starts a new run log from the run-log template; returns its path. Run logs left `running` by an activation
 * that stopped without `run end` are closed first, ended at their last write.
 */
export function startRun(person: string, root = repoRoot()): string {
  for (const old of listRuns(person, root).filter((p) => peek(p)?.status === "running")) {
    const { data, body } = readDoc<RunLogDoc>(old);
    const ended = statSync(old).mtime.toISOString();
    writeDoc(old, { ...data, ended, status: "finished" }, `${body}- ${ended} [note] closed when the next run started; this run had stopped without run end\n`);
  }
  const dir = runsDir(person, root);
  mkdirSync(dir, { recursive: true });
  let path = join(dir, `${stamp()}.md`);
  // A second run in the same minute sorts after the first ("_" comes after ".").
  for (let n = 2; existsSync(path); n++) path = join(dir, `${stamp()}_${n}.md`);
  const started = new Date().toISOString();
  writeFileSync(path, renderTemplate("run-log", { person, started }, person, root));
  return path;
}

const KIND_TO_COUNT: Record<string, keyof RunCounts | undefined> = { applied: "submitted", held: "held", skipped: "skipped", error: "errors", note: undefined };

/** Appends a timestamped line to the current running log and bumps its counts; starts one if none is running. */
export function logEvent(person: string, kind: "applied" | "held" | "skipped" | "error" | "note", message: string, root = repoRoot()): string {
  const path = currentRun(person, root) ?? startRun(person, root);
  const { data, body } = readDoc<RunLogDoc>(path);
  const field = KIND_TO_COUNT[kind];
  if (field) data.counts[field]++;
  const line = `- ${new Date().toISOString()} [${kind}] ${message}\n`;
  writeDoc(path, data, body + line);
  return path;
}

/** Closes the current running log: sets `ended` and `status: finished`. Returns its path, or null if none is running. */
export function endRun(person: string, root = repoRoot()): string | null {
  const path = currentRun(person, root);
  if (!path) return null;
  const { data, body } = readDoc<RunLogDoc>(path);
  data.ended = new Date().toISOString();
  data.status = "finished";
  writeDoc(path, data, body);
  return path;
}
