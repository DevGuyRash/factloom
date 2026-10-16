import { closeSync, existsSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { performance } from "node:perf_hooks";
import { basename, dirname, join } from "node:path";
import { peek, readDoc, stringify } from "./frontmatter.ts";
import { personDir, repoRoot } from "./repo.ts";
import { renderTemplate } from "./templates.ts";

export type RunCounts = { submitted: number; held: number; skipped: number; errors: number };
export type RunLogDoc = { type: "run-log"; person: string; started: string; ended?: string; status: "running" | "finished"; counts: RunCounts };

export const runsDir = (person: string, root = repoRoot()) => join(personDir(person, root), "runs");

// One short-lived lock covers activation admission and every read/modify/write of a person's logs.
// Never infer that a lock is abandoned from its age: an interrupted owner needs an explicit check.
function withRunLock<T>(person: string, root: string, work: () => T): T {
  const dir = runsDir(person, root);
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, ".write.local.lock");
  const deadline = performance.now() + 5000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let fd: number;
  for (;;) {
    try {
      fd = openSync(lock, "wx", 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (performance.now() >= deadline) throw new Error(
        `run log is busy: ${lock}. Retry logging after the writer finishes; an application record may already be saved, so do not repeat an external action. ` +
        "If a command stopped unexpectedly, inspect the lock's host and pid and verify that no writer remains before removing it; --takeover does not bypass this lock.",
      );
      Atomics.wait(pause, 0, 0, 25);
    }
  }
  let failed = false;
  let failure: unknown;
  try {
    writeFileSync(fd, JSON.stringify({ host: hostname(), pid: process.pid, started: new Date().toISOString() }) + "\n");
    return work();
  } catch (error) {
    failed = true;
    failure = error;
    throw error;
  } finally {
    try {
      try { closeSync(fd); } finally { unlinkSync(lock); }
    } catch (cleanup) {
      if (failed) {
        const detail = (error: unknown) => error instanceof Error ? error.message : String(error);
        throw new AggregateError([failure, cleanup], `run-log operation failed: ${detail(failure)}; lock cleanup failed: ${detail(cleanup)}`);
      }
      throw cleanup;
    }
  }
}

// Readers outside the lock see either complete version, never a truncated document.
function writeRunText(path: string, text: string): void {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.local.tmp`);
  try {
    const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
    writeFileSync(temporary, text, { flag: "wx", mode });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function writeRunDoc(path: string, data: RunLogDoc, body: string): void {
  writeRunText(path, stringify(data, body));
}

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
 * Opens the day's run log; returns its path. A day keeps one: a later activation the same day continues the log
 * that day's first one started, so its counts are the day's and a quiet activation adds no file. Other run logs
 * left `running` by an activation that stopped without `run end` are closed after publication, ended at their last write.
 */
export function startRun(person: string, root = repoRoot()): string {
  return withRunLock(person, root, () => startRunUnlocked(person, root));
}

export type RunStartResult = { started: true; path: string } | { started: false; active: { path: string; lastWrite: Date } };

/** Checks recent activity and opens the log under the same lock, so only one activation enters. */
export function tryStartRun(person: string, minutes: number, takeover = false, root = repoRoot()): RunStartResult {
  return withRunLock(person, root, () => {
    const active = activeRun(person, minutes, root);
    if (active && !takeover) return { started: false, active };
    return { started: true, path: startRunUnlocked(person, root) };
  });
}

function startRunUnlocked(person: string, root: string): string {
  const runs = listRuns(person, root);
  const latest = runs[runs.length - 1];
  const continued = latest && basename(latest).startsWith(stamp().slice(0, 10)) ? latest : undefined;
  let path: string;
  if (continued) {
    const { data, body } = readDoc<RunLogDoc>(continued);
    const { ended: _ended, ...rest } = data;
    const why = data.status === "running" ? "an earlier activation stopped without run end; continued here" : "continued by a later activation";
    writeRunDoc(continued, { ...rest, status: "running" }, `${body}- ${new Date().toISOString()} [note] ${why}\n`);
    path = continued;
  } else {
    const dir = runsDir(person, root);
    path = join(dir, `${stamp()}.md`);
    for (let n = 2; existsSync(path); n++) path = join(dir, `${stamp()}_${n}.md`);
    const started = new Date().toISOString();
    writeRunText(path, renderTemplate("run-log", { person, started }, person, root));
  }
  // Publish the current running log before retiring older logs; readers never see a false idle gap.
  for (const old of runs.filter((p) => p !== path && peek(p)?.status === "running")) {
    const { data, body } = readDoc<RunLogDoc>(old);
    const ended = statSync(old).mtime.toISOString();
    writeRunDoc(old, { ...data, ended, status: "finished" }, `${body}- ${ended} [note] closed when the next run started; this run had stopped without run end\n`);
  }
  return path;
}

const KIND_TO_COUNT: Record<string, keyof RunCounts | undefined> = { applied: "submitted", held: "held", skipped: "skipped", error: "errors", note: undefined };

/** Appends a timestamped line to the current running log and bumps its counts; starts one if none is running. */
export function logEvent(person: string, kind: "applied" | "held" | "skipped" | "error" | "note", message: string, root = repoRoot()): string {
  return withRunLock(person, root, () => {
    const path = currentRun(person, root) ?? startRunUnlocked(person, root);
    const { data, body } = readDoc<RunLogDoc>(path);
    const field = KIND_TO_COUNT[kind];
    if (field) data.counts[field]++;
    const line = `- ${new Date().toISOString()} [${kind}] ${message}\n`;
    writeRunDoc(path, data, body + line);
    return path;
  });
}

/** Closes the current running log: sets `ended` and `status: finished`. Returns its path, or null if none is running. */
export function endRun(person: string, root = repoRoot()): string | null {
  return withRunLock(person, root, () => {
    const path = currentRun(person, root);
    if (!path) return null;
    const { data, body } = readDoc<RunLogDoc>(path);
    data.ended = new Date().toISOString();
    data.status = "finished";
    writeRunDoc(path, data, body);
    return path;
  });
}
