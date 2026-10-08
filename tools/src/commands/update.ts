// Updating to the newest engine. Everything outside people/ and custom/ belongs to the engine, so an
// update merges cleanly as long as those files were not edited here; this checks that first, merges
// the engine's main branch, reinstalls dependencies when they changed, runs the checks, and lists
// generated resumes that the new engine would render differently. Records under people/ and custom/ stay
// where they are, modified or not: no engine change touches them. Only records already staged for a commit
// are unstaged for the merge (so the merge commit holds nothing but the engine) and staged again after it.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
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
  | { status: "no-remote" | "dirty" | "busy" | "no-history" | "edited" | "conflict" | "fetch-failed"; message: string; files?: string[] }
  | { status: "up-to-date" | "dry-run" | "updated" | "linked"; message: string; incoming?: string[]; extra?: string[]; depsChanged?: boolean; staged?: string[]; restageError?: string };

/** Unstages records for a merge, leaving their files exactly as they are; false when git could not. */
function unstage(paths: string[], root: string): boolean {
  return !paths.length || git(["reset", "-q", "--", ...paths], root).ok;
}

/** Stages the records again (one that has vanished since is skipped); the reason when git could not. */
function restage(paths: string[], root: string): string | undefined {
  const live = paths.filter((p) => existsSync(join(root, p)) || git(["ls-files", "--error-unmatch", "--", p], root).ok);
  if (!live.length) return undefined;
  const added = git(["add", "-A", "--", ...live], root);
  return added.ok ? undefined : `the records staged before the update could not be staged again; run \`git add -A -- ${live.map((p) => JSON.stringify(p)).join(" ")}\` (${added.err})`;
}

/** The git part of an update: fetch, check for local engine edits, merge (or link once with `link`). */
export function updateFrom(root: string, opts: { dryRun?: boolean; link?: boolean } = {}): UpdateResult {
  const ensured = ensureUpstreamRemote(root);
  if ("error" in ensured) return { status: "no-remote", message: ensured.error };
  const name = ensured.remote.name;
  // Uncommitted changes to engine files would have the engine merged over them, so they stop the update. Records under
  // people/ and custom/ do not: modified records stay as they are. Staged records would ride into the merge commit, so
  // they are unstaged for the merge and staged again after it; while an activation is at work they are probably
  // mid-commit, and the update waits for a moment.
  // -z keeps unusual file names unquoted; --no-renames lists both sides of a rename, so a whole change is named.
  const names = (args: string[]) => git(args, root).out.split("\0").filter(Boolean);
  const engineEdits = names(["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]).filter((p) => !PERSON_DATA.test(p));
  if (engineEdits.length) {
    return { status: "dirty", files: engineEdits, message: `commit or undo these uncommitted changes to engine files first; update merges the engine over them:\n  ${engineEdits.join("\n  ")}` };
  }
  const staged = names(["diff", "--cached", "--name-only", "--no-renames", "-z", "--"]);
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

  if (!base.ok) {
    if (!opts.link) return { status: "no-history", message: "this copy does not share history with the engine yet. Run `./resumes update --link` once: it merges the engine in, taking the engine's version of every file outside people/ and custom/." };
    if (opts.dryRun) return { status: "dry-run", message: `would link this copy to ${target}`, staged };
    if (!unstage(staged, root)) return { status: "dirty", files: staged, message: "the staged records under people/ and custom/ could not be unstaged for the update; commit them first" };
    const merged = git(["merge", "--allow-unrelated-histories", "--no-commit", "-X", "theirs", target], root);
    if (!merged.ok && !git(["diff", "--name-only", "--cached"], root).out) {
      git(["merge", "--abort"], root);
      const restageError = restage(staged, root);
      return { status: "conflict", message: `merge failed: ${merged.err}${restageError ? `\n${restageError}` : ""}` };
    }
    // Files the engine does not have, outside people/ and custom/: left for the person to move or delete.
    const engineFiles = new Set(git(["ls-tree", "-r", "--name-only", target], root).out.split("\n"));
    const extra = git(["ls-files", "--", ".", ...DATA], root).out.split("\n").filter((f) => f && !engineFiles.has(f));
    git(["commit", "--no-edit", "-m", "Link to the factloom engine"], root);
    return { status: "linked", message: `linked to ${target}`, extra, staged, restageError: restage(staged, root) };
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
  const lockBefore = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out;
  if (!unstage(staged, root)) return { status: "dirty", files: staged, message: "the staged records under people/ and custom/ could not be unstaged for the update; commit them first" };
  const merged = git(["merge", "--no-edit", target], root);
  if (!merged.ok) {
    git(["merge", "--abort"], root);
    const restageError = restage(staged, root);
    return { status: "conflict", message: `the merge stopped on a conflict and was undone: ${merged.err}${restageError ? `\n${restageError}` : ""}` };
  }
  const restageError = restage(staged, root);
  const depsChanged = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out !== lockBefore;
  return { status: "updated", message: `merged ${incoming.length} engine change(s)`, incoming, depsChanged, extra, staged, restageError };
}

const command: Command = {
  name: "update",
  summary: "Update to the newest engine: checks for local engine edits, merges, reinstalls, and checks",
  usage: "resumes update [--dry-run] [--link]   (--link connects a copy that does not share the engine's history yet, once)",
  async run(argv) {
    const a = parseArgs(argv, ["dry-run", "link"]);
    const root = repoRoot();
    const r = updateFrom(root, { dryRun: has(a, "dry-run"), link: has(a, "link") });
    if (["no-remote", "dirty", "busy", "no-history", "edited", "conflict", "fetch-failed"].includes(r.status)) { console.error(r.message); return 1; }
    console.log(r.message);
    if ("staged" in r && r.staged?.length) console.log(`${r.staged.length} record(s) staged for a commit ${r.status === "dry-run" ? "would be unstaged for the merge and staged again" : "were unstaged for the merge and staged again"}, so the merge holds only the engine`);
    if ("restageError" in r && r.restageError) console.error(r.restageError);
    if ("incoming" in r && r.incoming?.length) console.log(`  ${r.incoming.slice(0, 15).join("\n  ")}${r.incoming.length > 15 ? "\n  …" : ""}`);
    if ("extra" in r && r.extra?.length) console.log(`These files are outside people/ and custom/ but not part of the engine; move what you want to keep into custom/ and delete the rest:\n  ${r.extra.join("\n  ")}`);
    if (r.status !== "updated" && r.status !== "linked") return 0;
    if ("depsChanged" in r && r.depsChanged) {
      console.log("dependencies changed; reinstalling");
      spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: join(engineRoot(), "tools"), stdio: "inherit", shell: process.platform === "win32" });
    }
    // Fresh processes run the merged engine; this one still has the code from before the merge loaded.
    spawnSync(process.execPath, [...process.execArgv, process.argv[1], "check"], { stdio: "inherit" });
    spawnSync(process.execPath, [...process.execArgv, process.argv[1], "build-resumes", "--check"], { stdio: "inherit" });
    return 0;
  },
};
export default command;
