// Personal-data guard: `resumes pii [--staged] [paths...]`. Scans text files and docx text for
// SSNs, birth dates, card numbers (Luhn), API-key/token shapes, and street addresses. Exit 1 on
// any finding not covered by shared/pii-allow.yaml. Never prints a full matched secret.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { repoRoot } from "../lib/repo.ts";
import { listScannableFiles, loadAllowlist, scanFile, type Finding } from "../lib/pii.ts";

function stagedFiles(root: string): string[] {
  try {
    const out = execFileSync("git", ["-C", root, "diff", "--cached", "--name-only", "-z"], { encoding: "utf8" });
    return out.split("\0").filter(Boolean).map((f) => resolve(root, f));
  } catch {
    return [];
  }
}

const command: Command = {
  name: "pii",
  summary: "Scan for personal data and secrets (exit 1 on findings)",
  usage: "resumes pii [--staged] [<path> ...]",
  async run(argv) {
    const a = parseArgs(argv, ["staged"]);
    const root = repoRoot();
    const allow = loadAllowlist(root);
    const files = has(a, "staged")
      ? stagedFiles(root).filter((f) => existsSync(f))
      : a._.length
        ? a._.map((p) => resolve(p))
        : listScannableFiles(root);

    const findings: Finding[] = [];
    for (const f of files) findings.push(...(await scanFile(f, relative(root, f), allow)));

    for (const find of findings) console.log(`${find.file}:${find.line}: ${find.kind} ${find.snippet}`);
    console.log(`${findings.length} finding(s)`);
    return findings.length ? 1 : 0;
  },
};
export default command;
