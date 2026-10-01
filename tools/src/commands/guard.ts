// The push guard. Personal data (people/ and custom/) may go only to the one private repository the
// person verified, never to the public engine; engine changes may go anywhere, but not with a person's
// name, email, phone, or links in them. The pre-push hook (.githooks/pre-push) runs `guard pre-push`.
import { readFileSync } from "node:fs";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { peek } from "../lib/frontmatter.ts";
import { dataPathsIn, ENGINE_OWNED_DATA, git, PRIVATE_REMOTE_KEY, remotes, repoSlug, sameRepo, upstreamUrl, visibility } from "../lib/git.ts";
import { findByType, listPeople, personDir, repoRoot } from "../lib/repo.ts";

const ZERO = /^0+$/;

/** Words that identify the real people in this repository (example people excluded), for the leak scan. */
export function personalTokens(root: string): string[] {
  const out = new Set<string>();
  for (const person of listPeople(root)) {
    for (const path of findByType(personDir(person, root), "profile")) {
      const p = peek(path) ?? {};
      if (p.example === true) continue;
      const name = String(p.name ?? "").trim();
      if (name) out.add(name);
      for (const part of name.split(/\s+/)) if (part.length >= 4) out.add(part);
      if (p.email) out.add(String(p.email));
      const digits = String(p.phone ?? "").replace(/\D/g, "");
      if (digits.length >= 7) out.add(digits.slice(-7));
      for (const link of Array.isArray(p.links) ? p.links : []) {
        const bare = String(link).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
        if (bare.length >= 6) out.add(bare);
      }
      out.add(person);
    }
  }
  return [...out];
}

/** Added lines in a commit range, outside people/ and custom/, that contain a personal token. */
export function leaksIn(range: string[], tokens: string[], cwd: string): { file: string; token: string }[] {
  if (!tokens.length) return [];
  const diff = git(["log", "-p", "--format=", "--no-color", "--unified=0", ...range, "--", ".", ":(exclude)people", ":(exclude)custom"], cwd).out;
  const hits: { file: string; token: string }[] = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) { file = line.replace(/^\+\+\+ (b\/)?/, ""); continue; }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const digitsOnly = line.replace(/\D/g, "");
    for (const t of tokens) {
      const hit = /^\d+$/.test(t) ? digitsOnly.includes(t) : line.toLowerCase().includes(t.toLowerCase());
      if (hit) hits.push({ file, token: t });
    }
  }
  return hits.filter((h, i) => hits.findIndex((o) => o.file === h.file && o.token === h.token) === i);
}

type RefUpdate = { localSha: string; remoteSha: string };

/** Checks one push; returns the reasons to refuse it (empty to allow). */
export function checkPush(remoteName: string, url: string, updates: RefUpdate[], cwd: string, root = cwd): string[] {
  const problems: string[] = [];
  const toUpstream = sameRepo(url, upstreamUrl());
  for (const u of updates) {
    if (ZERO.test(u.localSha)) continue; // deleting a branch sends no content
    const range = ZERO.test(u.remoteSha) ? [u.localSha, "--not", `--remotes=${remoteName}`] : [`${u.remoteSha}..${u.localSha}`];
    const data = dataPathsIn(range, cwd);
    if (toUpstream) {
      if (data.length) problems.push(`this push would publish ${data.length} file(s) from people/ or custom/ to the public engine (${repoSlug(url)}), for example ${data.slice(0, 3).join(", ")}. Engine changes go from a branch based on the engine (see CONTRIBUTING.md).`);
      const leaks = leaksIn(range, personalTokens(root), cwd);
      if (leaks.length) problems.push(`these engine changes contain personal details from a profile: ${leaks.slice(0, 5).map((l) => `${l.file} (${l.token.length > 3 ? `${l.token.slice(0, 2)}…` : "…"})`).join(", ")}. Remove them before contributing.`);
      continue;
    }
    if (!data.length) continue;
    const allowed = git(["config", "--get", PRIVATE_REMOTE_KEY], cwd).out;
    if (allowed && sameRepo(allowed, url)) continue;
    const vis = visibility(url, cwd);
    if (vis === "PRIVATE" || vis === "INTERNAL") continue;
    problems.push(`this push would send ${data.length} file(s) from people/ or custom/ to ${repoSlug(url)}, which is ${vis ? `${vis.toLowerCase()}` : "not verified as private (the GitHub CLI could not check it)"}. Personal data goes only to your private repository: run \`./resumes guard allow ${remoteName}\` once it is private.`);
  }
  return problems;
}

function prePush(remoteName: string, url: string, root: string): number {
  let input = "";
  try { if (!process.stdin.isTTY) input = readFileSync(0, "utf8"); } catch { input = ""; }
  const updates = input.split("\n").map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 4).map(([, localSha, , remoteSha]) => ({ localSha, remoteSha }));
  const problems = checkPush(remoteName, url, updates, root);
  if (!problems.length) return 0;
  console.error(`push refused by the factloom guard:\n  - ${problems.join("\n  - ")}\n(If you are certain, \`git push --no-verify\` skips this check.)`);
  return 1;
}

function allow(remoteName: string, root: string, force: boolean): number {
  const r = remotes(root).find((x) => x.name === remoteName);
  if (!r) { console.error(`no remote named ${remoteName}`); return 1; }
  if (sameRepo(r.push || r.fetch, upstreamUrl())) { console.error(`${remoteName} is the public engine; personal data never goes there`); return 1; }
  const vis = visibility(r.push || r.fetch, root);
  if (vis !== "PRIVATE" && vis !== "INTERNAL" && !force) {
    console.error(`${repoSlug(r.push || r.fetch)} is ${vis ? vis.toLowerCase() : "not verifiable with the GitHub CLI"}; make it private first (or, for a private repository outside GitHub, pass --force)`);
    return 1;
  }
  git(["config", PRIVATE_REMOTE_KEY, r.push || r.fetch], root);
  console.log(`personal data may now be pushed to ${repoSlug(r.push || r.fetch)} (${PRIVATE_REMOTE_KEY})`);
  return 0;
}

function status(root: string): number {
  const allowed = git(["config", "--get", PRIVATE_REMOTE_KEY], root).out;
  console.log(`engine (public): ${repoSlug(upstreamUrl())}`);
  console.log(`private data remote: ${allowed ? repoSlug(allowed) : "none yet (run ./resumes guard allow <remote> once your copy is private)"}`);
  for (const r of remotes(root)) console.log(`remote ${r.name}: fetch ${r.fetch}${r.push !== r.fetch ? `, push ${r.push}` : ""}`);
  const hook = git(["config", "--get", "core.hooksPath"], root).out;
  console.log(`pre-push hook: ${hook === ".githooks" ? "on" : "off (run ./resumes setup)"}`);
  return 0;
}

/** CI in the public engine: people/ and custom/ hold nothing but the files the engine ships. */
function upstreamCheck(root: string): number {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo && repo.toLowerCase() !== repoSlug(upstreamUrl())) { console.log(`not the public engine (${repo}); nothing to check`); return 0; }
  const tracked = git(["ls-files", "--", "people", "custom"], root).out.split("\n").filter((p) => p && !ENGINE_OWNED_DATA.has(p));
  if (tracked.length) { console.error(`the public engine must not contain personal data; remove: ${tracked.join(", ")}`); return 1; }
  console.log("people/ and custom/ hold only what the engine ships");
  return 0;
}

const USAGE = "resumes guard status | guard allow [remote] [--force] | guard pre-push <remote> <url> (run by the git hook) | guard upstream (CI in the public engine)";

const command: Command = {
  name: "guard",
  summary: "Keep personal data in your private repository: the pre-push check, and which remote may receive it",
  usage: USAGE,
  run(argv) {
    const a = parseArgs(argv, ["force"]);
    const root = repoRoot();
    switch (a._[0] ?? "status") {
      case "status": return status(root);
      case "allow": return allow(a._[1] ?? flag(a, "remote") ?? "origin", root, has(a, "force"));
      case "pre-push": return a._[1] && a._[2] ? prePush(a._[1], a._[2], root) : (console.error(`usage: ${USAGE}`), 2);
      case "upstream": return upstreamCheck(root);
      default: console.error(`usage: ${USAGE}`); return 2;
    }
  },
};
export default command;
