// Tracked files exclude editor lock files, local overlays, dependency/caches, and anything
// oversized. Skips non-Git roots, but an unreadable checkout must not look valid.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { MAX_TRACKED_BYTES } from "../lib/schema.ts";
import type { CheckContext, Rule } from "./types.ts";

/** Worktrees have a .git file; ordinary checkouts have a directory, possibly in a parent. */
function hasGitMetadata(root: string): boolean {
  let dir = resolve(root);
  for (;;) {
    try {
      lstatSync(join(dir, ".git"));
      return true;
    } catch (error) {
      // A broken metadata symlink still marks a checkout; lookup errors must not turn it into an export.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return true;
    }
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

const rule: Rule = {
  name: "tracked-files",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    const listed = spawnSync("git", ["-C", ctx.root, "ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (listed.status !== 0 || listed.error) {
      // A fixture or exported directory has no index to inspect. A real checkout (including one
      // selected by GIT_DIR) still fails closed when Git is unavailable or its index is unreadable.
      if (existsSync(ctx.root) && !hasGitMetadata(ctx.root) && !process.env.GIT_DIR) return { errors, warnings: [] };
      const reason = listed.error?.message || listed.stderr.trim() || `exit ${listed.status ?? "unknown"}`;
      return { errors: [`tracked-files: could not list tracked files: ${reason}`], warnings: [] };
    }
    for (const f of listed.stdout.split("\0").filter(Boolean)) {
      const base = basename(f);
      if (base.startsWith("~$") || (base.startsWith(".~lock.") && base.endsWith("#")) || base.includes(".local.") || base === ".DS_Store" || f.includes("node_modules/") || f.includes("__pycache__/") || base.endsWith(".pyc")) {
        errors.push(`${f}: should not be tracked`);
      }
      const p = join(ctx.root, f);
      if (existsSync(p) && statSync(p).isFile() && statSync(p).size > MAX_TRACKED_BYTES) {
        errors.push(`${f}: larger than ${Math.floor(MAX_TRACKED_BYTES / 1024 / 1024)} MB`);
      }
    }
    return { errors, warnings: [] };
  },
};
export default rule;
