// Updating to the newest engine. Everything outside people/ and custom/ belongs to the engine, so an
// update merges cleanly as long as those files were not edited here; this checks that first, merges
// the engine's main branch, reinstalls dependencies when they changed, runs the checks, and lists
// generated resumes that the new engine would render differently. Records under people/ and custom/ stay
// where they are, modified or not: no engine change touches them. Only records already staged for a commit
// are saved as an exact index patch, unstaged for the merge, and restored afterwards without staging new edits.
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { ensureUpstreamRemote, git } from "../lib/git.ts";
import { engineRoot } from "../lib/layers.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { listPeople, repoRoot } from "../lib/repo.ts";
import { activeRun } from "../lib/runlog.ts";

const DATA = [":(exclude)people", ":(exclude)custom"];
const PERSON_DATA = /^(people|custom)\//;

export type UpdateResult =
  | { status: "no-remote" | "dirty" | "busy" | "no-history" | "edited" | "conflict" | "fetch-failed" | "commit-failed"; message: string; files?: string[] }
  | { status: "up-to-date" | "dry-run" | "updated" | "linked"; message: string; incoming?: string[]; extra?: string[]; depsChanged?: boolean; staged?: string[]; restageError?: string };

type SavedIndex = { patch?: string };

/** A per-worktree recovery file, outside tracked records and never overwritten. */
function recoveryPath(root: string): string {
  const path = git(["rev-parse", "--git-path", "factloom-update-staged.patch"], root);
  if (!path.ok) throw new Error("could not locate the staged-record recovery file: " + path.err);
  return resolve(root, path.out);
}

function recoveryHint(saved: SavedIndex): string {
  return saved.patch
    ? "Exact staged content is saved in " + saved.patch + ". After finishing or aborting any merge, inspect it, restore it with git apply --cached --binary <patch>, and remove the recovery file."
    : "";
}

/** Save exact indexed bytes before resetting; never stage working-tree changes as a substitute. */
function unstage(paths: string[], root: string): SavedIndex | { error: string } {
  if (!paths.length) return {};
  const patch = recoveryPath(root);
  const diff = spawnSync("git", ["--literal-pathspecs", "diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--no-textconv", "--no-renames", "--", ...paths], { cwd: root, maxBuffer: 1 << 30 });
  if (diff.status !== 0 || diff.error || !diff.stdout?.length) {
    return { error: "could not save exact staged records before the update: " + (diff.stderr?.toString("utf8") || diff.error?.message || "the index changed; inspect it and retry") };
  }
  try {
    writeFileSync(patch, diff.stdout, { mode: 0o600, flag: "wx" });
  } catch (e) {
    return { error: "could not save staged records in " + patch + ": " + String(e) };
  }
  const reset = git(["--literal-pathspecs", "reset", "-q", "--", ...paths], root);
  return reset.ok ? { patch } : { error: "could not unstage records: " + reset.err + "\n" + recoveryHint({ patch }) };
}

/** Restore the original staged patch only; partial hunks, deletions and file modes survive. */
function restage(saved: SavedIndex, root: string): string | undefined {
  if (!saved.patch) return undefined;
  const applied = git(["apply", "--cached", "--binary", saved.patch], root);
  if (!applied.ok) return "the original record staging could not be restored: " + applied.err + "\n" + recoveryHint(saved);
  try {
    rmSync(saved.patch);
  } catch (e) {
    return "record staging was restored, but its recovery file could not be removed: " + saved.patch + " (" + String(e) + ")";
  }
  return undefined;
}

/** Do not restore private staging into a merge that Git could not abort. */
function failedMerge(root: string, saved: SavedIndex, reason: string): UpdateResult {
  if (git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], root).ok) {
    const aborted = git(["merge", "--abort"], root);
    if (!aborted.ok) return { status: "conflict", message: "merge failed: " + reason + "\nThe merge could not be aborted: " + aborted.err + "\n" + recoveryHint(saved) };
  }
  const error = restage(saved, root);
  return { status: "conflict", message: "the merge did not complete: " + reason + (error ? "\n" + error : "; original record staging was restored") };
}

/** The git part of an update: fetch, check for local engine edits, merge (or link once with `link`). */
export function updateFrom(root: string, opts: { dryRun?: boolean; link?: boolean } = {}): UpdateResult {
  if (git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], root).ok) {
    return { status: "busy", message: "a merge is already in progress; finish or abort it before updating" };
  }
  const recovery = recoveryPath(root);
  if (existsSync(recovery)) {
    return { status: "busy", message: "an earlier update left a staged-record recovery file; inspect and restore it before updating again. " + recoveryHint({ patch: recovery }) };
  }
  if (git(["ls-files", "--unmerged", "-z"], root).out) {
    return { status: "busy", message: "the index has unresolved conflicts; finish or abort that operation before updating" };
  }
  const ensured = ensureUpstreamRemote(root);
  if ("error" in ensured) return { status: "no-remote", message: ensured.error };
  const name = ensured.remote.name;
  // Uncommitted changes to engine files would have the engine merged over them, so they stop the update. Records under
  // people/ and custom/ do not: modified records stay as they are. Staged records would ride into the merge commit, so
  // they are unstaged for the merge and staged again after it; while an activation is at work they are probably
  // mid-commit, and the update waits for a moment.
  // -z keeps unusual file names unquoted; --no-renames lists both sides of a rename, so a whole change is named.
  const names = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, maxBuffer: 1 << 30 });
    if (result.status !== 0 || result.error) throw new Error("could not inspect the update's Git state: " + (result.stderr?.toString("utf8") || result.error?.message));
    const bytes = result.stdout ?? Buffer.alloc(0);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) throw new Error("Git paths are not UTF-8; checkpoint them manually before updating");
    return text.split("\0").filter(Boolean);
  };
  const staged = names(["diff", "--cached", "--name-only", "--no-renames", "-z", "--"]);
  const engineEdits = [...new Set([...staged, ...names(["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"])])].filter((p) => !PERSON_DATA.test(p));
  if (engineEdits.length) {
    return { status: "dirty", files: engineEdits, message: `commit or undo these uncommitted changes to engine files first; update merges the engine over them:\n  ${engineEdits.join("\n  ")}` };
  }
  if (staged.length) {
    const minutes = loadPipelineConfig(root).run_active_minutes;
    const active = listPeople(root).map((p) => activeRun(p, minutes, root)).find((r) => r !== null);
    if (active) {
      return { status: "busy", message: `records are staged while an activation is at work (${relative(root, active.path)} was written at ${active.lastWrite.toISOString()}): it is probably mid-commit; update again in a moment` };
    }
  }
  const fetched = git(["fetch", name], root);
  if (!fetched.ok) return { status: "fetch-failed", message: `could not fetch ${name}: ${fetched.err}` };
  const target = `${name}/main`;
  const base = git(["merge-base", "HEAD", target], root);
  const lockBefore = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out;

  if (!base.ok) {
    if (!opts.link) return { status: "no-history", message: "this copy does not share history with the engine yet. Run `./resumes update --link` once: it merges the engine in, taking the engine's version of every file outside people/ and custom/." };
    if (opts.dryRun) return { status: "dry-run", message: `would link this copy to ${target}`, staged };
    const saved = unstage(staged, root);
    if ("error" in saved) return { status: "dirty", files: staged, message: saved.error };
    const merged = git(["merge", "--allow-unrelated-histories", "--no-commit", "-X", "theirs", target], root);
    if (!merged.ok && !git(["diff", "--name-only", "--cached"], root).out) {
      return failedMerge(root, saved, merged.err);
    }
    // Files the engine does not have, outside people/ and custom/: left for the person to move or delete.
    const engineFiles = new Set(git(["ls-tree", "-r", "--name-only", target], root).out.split("\n"));
    const extra = git(["ls-files", "--", ".", ...DATA], root).out.split("\n").filter((f) => f && !engineFiles.has(f));
    const committed = git(["commit", "--no-edit", "-m", "Link to the factloom engine"], root);
    if (!committed.ok) {
      return { status: "commit-failed", files: staged, message: "link commit failed: " + committed.err + "\nInspect and finish or abort the merge before restoring previously staged records; they were not restaged. " + recoveryHint(saved) };
    }
    const depsChanged = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out !== lockBefore;
    return { status: "linked", message: `linked to ${target}`, depsChanged, extra, staged, restageError: restage(saved, root) };
  }

  // Local changes outside people/ and custom/ since the last merge. Edits to the engine's own files
  // can conflict and block the update; files the engine does not have cannot, and are only listed.
  const engineFiles = new Set(git(["ls-tree", "-r", "--name-only", target], root).out.split("\n"));
  const changes = git(["diff", "--name-status", base.out, "HEAD", "--", ".", ...DATA], root).out.split("\n").filter(Boolean)
    .map((l) => { const parts = l.split("\t"); return { status: parts[0][0], path: parts[parts.length - 1] }; });
  const edited = changes.filter((c) => c.status !== "A" || engineFiles.has(c.path)).map((c) => c.path);
  const extra = changes.filter((c) => c.status === "A" && !engineFiles.has(c.path)).map((c) => c.path);
  if (edited.length) {
    return { status: "edited", files: edited, message: `these engine files were changed in this copy, so an update could conflict:\n  ${edited.join("\n  ")}\nMove your changes into custom/ (themes, templates, catalog entries, pipeline numbers), or contribute them to the engine, then restore the files with \`git checkout ${target} -- <file>\`.` };
  }
  const incoming = git(["log", "--oneline", `HEAD..${target}`], root).out.split("\n").filter(Boolean);
  if (!incoming.length) return { status: "up-to-date", message: "already up to date", extra };
  if (opts.dryRun) return { status: "dry-run", message: `${incoming.length} engine change(s) to merge`, incoming, extra, staged };
  const saved = unstage(staged, root);
  if ("error" in saved) return { status: "dirty", files: staged, message: saved.error };
  const merged = git(["merge", "--no-edit", target], root);
  if (!merged.ok) {
    return failedMerge(root, saved, merged.err);
  }
  const restageError = restage(saved, root);
  const depsChanged = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out !== lockBefore;
  return { status: "updated", message: `merged ${incoming.length} engine change(s)`, incoming, depsChanged, extra, staged, restageError };
}

/** A failed post-merge step does not roll back the completed engine merge. */
function stepExit(step: string, result: ReturnType<typeof spawnSync>): number {
  if (result.status === 0 && !result.error && !result.signal) return 0;
  const reason = result.error?.message ?? (result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`);
  console.error(`engine merge completed; ${step} did not pass (${reason})`);
  return result.status || 1;
}

const command: Command = {
  name: "update",
  summary: "Update to the newest engine: checks for local engine edits, merges, reinstalls, and checks",
  usage: "resumes update [--dry-run] [--link]   (--link connects a copy that does not share the engine's history yet, once)",
  async run(argv) {
    const a = parseArgs(argv, ["dry-run", "link"]);
    const root = repoRoot();
    const r = updateFrom(root, { dryRun: has(a, "dry-run"), link: has(a, "link") });
    if (["no-remote", "dirty", "busy", "no-history", "edited", "conflict", "fetch-failed", "commit-failed"].includes(r.status)) { console.error(r.message); return 1; }
    if ("restageError" in r && r.restageError) {
      console.error(`${r.message}, but ${r.restageError}; verification was not run`);
      return 1;
    }
    console.log(r.message);
    if ("staged" in r && r.staged?.length) console.log(`${r.staged.length} record(s) staged for a commit ${r.status === "dry-run" ? "would be unstaged for the merge and staged again" : "were unstaged for the merge and staged again"}, so the merge holds only the engine`);
    if ("incoming" in r && r.incoming?.length) console.log(`  ${r.incoming.slice(0, 15).join("\n  ")}${r.incoming.length > 15 ? "\n  …" : ""}`);
    if ("extra" in r && r.extra?.length) console.log(`These files are outside people/ and custom/ but not part of the engine; move what you want to keep into custom/ and delete the rest:\n  ${r.extra.join("\n  ")}`);
    if (r.status !== "updated" && r.status !== "linked") return 0;
    if ("depsChanged" in r && r.depsChanged) {
      console.log("dependencies changed; reinstalling");
      const installed = stepExit("dependency installation", spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: join(engineRoot(), "tools"), stdio: "inherit", shell: process.platform === "win32" }));
      if (installed) return installed;
    }
    // Fresh processes run the merged engine; this one still has the code from before the merge loaded.
    const checked = stepExit("repository check", spawnSync(process.execPath, [...process.execArgv, process.argv[1], "check"], { stdio: "inherit" }));
    if (checked) return checked;
    return stepExit("resume render check", spawnSync(process.execPath, [...process.execArgv, process.argv[1], "build-resumes", "--check"], { stdio: "inherit" }));
  },
};
export default command;
