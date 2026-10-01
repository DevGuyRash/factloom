// Tracked files exclude editor lock files, local overlays, dependency/caches, and anything
// oversized. Silently does nothing outside a git checkout (matches the Python checker).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { MAX_TRACKED_BYTES } from "../lib/schema.ts";
import type { CheckContext, Rule } from "./types.ts";

const rule: Rule = {
  name: "tracked-files",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    let out: string;
    try {
      out = execFileSync("git", ["-C", ctx.root, "ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return { errors, warnings: [] };
    }
    for (const f of out.split("\0").filter(Boolean)) {
      const base = basename(f);
      if (base.startsWith("~$") || base.includes(".local.") || base === ".DS_Store" || f.includes("node_modules/") || f.includes("__pycache__/") || base.endsWith(".pyc")) {
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
