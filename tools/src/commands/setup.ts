// First-time setup of a checkout: git hooks, readable diffs for Word and PDF files, the remotes
// (the public engine to update from, and the person's own private repository for their data), then
// doctor and check. Safe to run again at any time; it only changes what is not set up yet.
import { spawnSync } from "node:child_process";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { DISABLED_PUSH, ensureUpstreamRemote, freeRemoteName, gh, git, PRIVATE_REMOTE_KEY, remotes, repoSlug, ROLE_KEY, sameRepo, upstreamUrl, visibility } from "../lib/git.ts";
import { repoRoot } from "../lib/repo.ts";

function which(cmd: string): string | undefined {
  const r = spawnSync(process.platform === "win32" ? "where" : "sh", process.platform === "win32" ? [cmd] : ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : undefined;
}

/** Makes sure a fetch-only engine remote exists, so updates come from it and nothing is ever pushed to it. */
function linkUpstream(root: string, say: (s: string) => void): void {
  const r = ensureUpstreamRemote(root);
  if ("error" in r) { say(r.error); return; }
  if (r.remote.name !== "origin" && r.remote.push !== DISABLED_PUSH) git(["remote", "set-url", "--push", r.remote.name, DISABLED_PUSH], root);
  if (r.added) say(`added remote ${r.added} (${repoSlug(upstreamUrl())}) for updates; pushing to it is disabled`);
}

function createPrivateCopy(name: string, root: string, say: (s: string) => void): boolean {
  const origin = remotes(root).find((r) => r.name === "origin");
  if (origin && !sameRepo(origin.fetch, upstreamUrl())) {
    say(`origin already points at ${repoSlug(origin.fetch)}; not creating another repository`);
    return true;
  }
  if (!gh(["auth", "status"], root).ok) { say("the GitHub CLI is not signed in: run `gh auth login`, then run setup again"); return false; }
  if (origin) {
    const engineName = freeRemoteName(root);
    if (!engineName) { say("remotes named upstream, factloom, and factloom-engine all exist already; rename one, then run setup again"); return false; }
    const renamed = git(["remote", "rename", "origin", engineName], root);
    if (!renamed.ok) { say(`could not rename origin: ${renamed.err}`); return false; }
    git(["remote", "set-url", "--push", engineName, DISABLED_PUSH], root);
    say(`renamed origin to ${engineName} (the public engine; pushing to it is disabled)`);
  }
  const created = gh(["repo", "create", name, "--private", "--source", ".", "--remote", "origin"], root);
  if (!created.ok) { say(`could not create ${name}: ${created.err}`); return false; }
  const url = remotes(root).find((r) => r.name === "origin")?.fetch ?? "";
  if (visibility(url, root) !== "PRIVATE") { say(`${repoSlug(url)} is not private; not pushing anything to it`); return false; }
  git(["config", PRIVATE_REMOTE_KEY, url], root);
  say(`created ${repoSlug(url)} (private) as origin; your data may be pushed there`);
  const branch = git(["branch", "--show-current"], root).out || "main";
  const pushed = git(["push", "-u", "origin", branch], root);
  say(pushed.ok ? `pushed ${branch} to origin` : `push to origin failed: ${pushed.err}`);
  return pushed.ok;
}

const command: Command = {
  name: "setup",
  summary: "Set up this checkout: git hooks, diff drivers, the engine remote, and optionally your private GitHub copy",
  usage: "resumes setup [--private-repo <name>] [--engine]   (--private-repo creates a private GitHub repository for your data; --engine is for working on the engine itself)",
  run(argv) {
    const a = parseArgs(argv, ["engine"]);
    const root = repoRoot();
    const say = (s: string) => console.log(`- ${s}`);
    if (!git(["rev-parse", "--is-inside-work-tree"], root).ok) { console.error("not a git checkout: clone the repository with git first"); return 1; }

    if (git(["config", "--get", "core.hooksPath"], root).out !== ".githooks") {
      git(["config", "core.hooksPath", ".githooks"], root);
      say("enabled the git hooks (checks before each commit; the privacy guard before each push)");
    }
    const pandoc = which("pandoc"), pdftotext = which("pdftotext");
    if (pandoc && !git(["config", "--get", "diff.docx.textconv"], root).ok) { git(["config", "diff.docx.textconv", "pandoc --to=plain --wrap=none"], root); say("Word files now show as text in git diffs"); }
    if (pdftotext && !git(["config", "--get", "diff.pdf.textconv"], root).ok) { git(["config", "diff.pdf.textconv", `sh -c '${pdftotext} -layout "$0" -'`], root); say("PDF files now show as text in git diffs"); }

    if (has(a, "engine")) {
      if (git(["config", "--get", ROLE_KEY], root).out !== "engine") git(["config", ROLE_KEY, "engine"], root);
      say(`engine mode: this checkout is for working on factloom itself (${ROLE_KEY} = engine); remotes left as they are`);
    } else {
      const privateRepo = flag(a, "private-repo");
      if (privateRepo && !createPrivateCopy(privateRepo, root, say)) return 1;
      linkUpstream(root, say);
      const origin = remotes(root).find((r) => r.name === "origin");
      if (origin && sameRepo(origin.fetch, upstreamUrl())) {
        say("origin is still the public engine. Your data must not go there; create your private copy with: ./resumes setup --private-repo <name>");
      } else if (origin && !git(["config", "--get", PRIVATE_REMOTE_KEY], root).ok && visibility(origin.fetch, root) === "PRIVATE") {
        git(["config", PRIVATE_REMOTE_KEY, origin.fetch], root);
        say(`origin (${repoSlug(origin.fetch)}) is private; your data may be pushed there`);
      }
    }

    console.log("\nDoctor:");
    spawnSync(process.execPath, [process.argv[1], "doctor"], { stdio: "inherit" });
    console.log(has(a, "engine")
      ? "\nNext: open Claude Code or Codex in this folder to work on the engine (AGENTS.md, \"Working on the engine\", and CONTRIBUTING.md)."
      : "\nNext: open Claude Code or Codex in this folder and say \"set me up\". The agent creates your person, turns your current resume into its source files, and runs onboarding.");
    return 0;
  },
};
export default command;
