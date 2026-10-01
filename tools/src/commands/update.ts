// Updating to the newest engine. Everything outside people/ and custom/ belongs to the engine, so an
// update merges cleanly as long as those files were not edited here; this checks that first, merges
// the engine's main branch, reinstalls dependencies when they changed, runs the checks, and lists
// generated resumes that the new engine would render differently.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { git, upstreamRemote, upstreamUrl } from "../lib/git.ts";
import { engineRoot } from "../lib/layers.ts";
import { staleGenerated } from "../lib/generated.ts";
import { repoRoot } from "../lib/repo.ts";

const DATA = [":(exclude)people", ":(exclude)custom"];

export type UpdateResult =
  | { status: "dirty" | "no-history" | "edited" | "conflict" | "fetch-failed"; message: string; files?: string[] }
  | { status: "up-to-date" | "dry-run" | "updated" | "linked"; message: string; incoming?: string[]; extra?: string[]; depsChanged?: boolean };

/** The git part of an update: fetch, check for local engine edits, merge (or link once with `link`). */
export function updateFrom(root: string, opts: { dryRun?: boolean; link?: boolean } = {}): UpdateResult {
  let remote = upstreamRemote(root);
  if (!remote) {
    git(["remote", "add", "upstream", upstreamUrl()], root);
    remote = upstreamRemote(root);
  }
  const name = remote!.name;
  if (git(["status", "--porcelain", "--untracked-files=no"], root).out) return { status: "dirty", message: "commit or stash your changes first; update merges into a clean checkout" };
  const fetched = git(["fetch", name], root);
  if (!fetched.ok) return { status: "fetch-failed", message: `could not fetch ${name}: ${fetched.err}` };
  const target = `${name}/main`;
  const base = git(["merge-base", "HEAD", target], root);

  if (!base.ok) {
    if (!opts.link) return { status: "no-history", message: "this copy does not share history with the engine yet. Run `./resumes update --link` once: it merges the engine in, taking the engine's version of every file outside people/ and custom/." };
    if (opts.dryRun) return { status: "dry-run", message: `would link this copy to ${target}` };
    const merged = git(["merge", "--allow-unrelated-histories", "--no-commit", "-X", "theirs", target], root);
    if (!merged.ok && !git(["diff", "--name-only", "--cached"], root).out) {
      git(["merge", "--abort"], root);
      return { status: "conflict", message: `merge failed: ${merged.err}` };
    }
    // Files the engine does not have, outside people/ and custom/: left for the person to move or delete.
    const engineFiles = new Set(git(["ls-tree", "-r", "--name-only", target], root).out.split("\n"));
    const extra = git(["ls-files", "--", ".", ...DATA], root).out.split("\n").filter((f) => f && !engineFiles.has(f));
    git(["commit", "--no-edit", "-m", "Link to the factloom engine"], root);
    return { status: "linked", message: `linked to ${target}`, extra };
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
  if (opts.dryRun) return { status: "dry-run", message: `${incoming.length} engine change(s) to merge`, incoming, extra };
  const lockBefore = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out;
  const merged = git(["merge", "--no-edit", target], root);
  if (!merged.ok) {
    git(["merge", "--abort"], root);
    return { status: "conflict", message: `the merge stopped on a conflict and was undone: ${merged.err}` };
  }
  const depsChanged = git(["rev-parse", "HEAD:tools/package-lock.json"], root).out !== lockBefore;
  return { status: "updated", message: `merged ${incoming.length} engine change(s)`, incoming, depsChanged, extra };
}

const command: Command = {
  name: "update",
  summary: "Update to the newest engine: checks for local engine edits, merges, reinstalls, and checks",
  usage: "resumes update [--dry-run] [--link]   (--link connects a copy that does not share the engine's history yet, once)",
  async run(argv) {
    const a = parseArgs(argv, ["dry-run", "link"]);
    const root = repoRoot();
    const r = updateFrom(root, { dryRun: has(a, "dry-run"), link: has(a, "link") });
    if (["dirty", "no-history", "edited", "conflict", "fetch-failed"].includes(r.status)) { console.error(r.message); return 1; }
    console.log(r.message);
    if ("incoming" in r && r.incoming?.length) console.log(`  ${r.incoming.slice(0, 15).join("\n  ")}${r.incoming.length > 15 ? "\n  …" : ""}`);
    if ("extra" in r && r.extra?.length) console.log(`These files are outside people/ and custom/ but not part of the engine; move what you want to keep into custom/ and delete the rest:\n  ${r.extra.join("\n  ")}`);
    if (r.status !== "updated" && r.status !== "linked") return 0;
    if ("depsChanged" in r && r.depsChanged) {
      console.log("dependencies changed; reinstalling");
      spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: join(engineRoot(), "tools"), stdio: "inherit", shell: process.platform === "win32" });
    }
    spawnSync(process.execPath, [process.argv[1], "check"], { stdio: "inherit" });
    const stale = await staleGenerated(root);
    if (stale.length) console.log(`The new engine renders these resumes differently; rebuild them (\`./resumes build-resumes --person <p> --variant <v>\`), review, and commit:\n  ${stale.map((g) => `${g.person}/${g.variant}`).join("\n  ")}`);
    return 0;
  },
};
export default command;
