// Personal-data guard: `resumes pii [--staged] [paths...]`. Scans text files and docx text for
// SSNs, birth dates, card numbers (Luhn), API-key/token shapes, and street addresses. Exit 1 on
// any finding not covered by shared/pii-allow.yaml. Never prints a full matched secret.
import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { repoRoot } from "../lib/repo.ts";
import { listScannableFiles, loadAllowlist, parseAllowlists, scanContent, scanFile, type Finding } from "../lib/pii.ts";

/** Snapshot index object ids: later reads use these bytes, never unstaged files or allowlist edits. */
function stagedSnapshot(root: string): { files: string[]; read: (path: string) => Buffer | undefined } {
  const git = (args: string[]) => execFileSync("git", ["-C", root, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const names = (args: string[]) => {
    const bytes = git(args);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) throw new Error("pii: Git paths are not UTF-8; rename them before scanning staged content");
    return text.split("\0").filter(Boolean);
  };
  const entries = new Map<string, string>();
  for (const entry of names(["ls-files", "--stage", "-z"])) {
    const match = /^([0-7]+) ([a-f0-9]+) ([0-3])\t([\s\S]*)$/.exec(entry);
    if (!match) throw new Error("pii: could not read Git index entries");
    if (match[3] !== "0") throw new Error("pii: resolve unmerged Git index entries before scanning staged content");
    entries.set(match[4], match[2]);
  }
  const files = names(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--name-only", "--diff-filter=ACMRT", "-z"]);
  for (const path of files) if (!entries.has(path)) throw new Error("pii: staged content changed while reading the Git index; retry the scan");
  return { files, read: (path) => {
    const object = entries.get(path);
    return object ? git(["cat-file", "blob", object]) : undefined;
  } };
}

const command: Command = {
  name: "pii",
  summary: "Scan for personal data and secrets (exit 1 on findings)",
  usage: "resumes pii [--staged] [<path> ...]",
  async run(argv) {
    const a = parseArgs(argv, ["staged"]);
    const root = repoRoot();
    const findings: Finding[] = [];
    if (has(a, "staged")) {
      const staged = stagedSnapshot(root);
      const allow = parseAllowlists(["shared/pii-allow.yaml", "custom/pii-allow.yaml"].flatMap((path) => {
        const content = staged.read(path);
        return content ? [content.toString("utf8")] : [];
      }));
      for (const path of staged.files) {
        const content = staged.read(path);
        if (!content) throw new Error("pii: could not read staged content");
        findings.push(...(await scanContent(content, path, allow)));
      }
    } else {
      const allow = loadAllowlist(root);
      const files = a._.length ? a._.map((p) => resolve(p)) : listScannableFiles(root);
      for (const file of files) findings.push(...(await scanFile(file, relative(root, file), allow)));
    }

    for (const find of findings) console.log(`${find.file}:${find.line}: ${find.kind} ${find.snippet}`);
    console.log(`${findings.length} finding(s)`);
    if (findings.length) {
      // The remedy, so a finding is resolved rather than worked around: the check itself is never skipped.
      console.log(
        "Resolve each finding before committing: a detail of the person's own (their address, an ID number) moves into a *.local.* file, which git ignores; " +
          "text that only looks like one, or is public (an employer's office address, a court named in a posting), goes into custom/pii-allow.yaml under `strings`, exactly as it appears. " +
          "Never skip the check with --no-verify.",
      );
    }
    return findings.length ? 1 : 0;
  },
};
export default command;
