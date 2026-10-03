// The push guard. Personal data (people/ and custom/) may go only to the one private repository the
// person verified, never to the public engine; engine changes may go anywhere, but not with a person's
// name, email, phone, or links in them. The pre-push hook (.githooks/pre-push) runs `guard pre-push`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { peek } from "../lib/frontmatter.ts";
import { dataPathsIn, ENGINE_OWNED_DATA, git, PRIVATE_REMOTE_KEY, privateCopies, remotes, repoSlug, sameRepo, upstreamUrl, visibility } from "../lib/git.ts";
import { extractDocumentText } from "../lib/pii.ts";
import { findByType, listPeople, personDir, repoRoot } from "../lib/repo.ts";

const ZERO = /^0+$/;

/**
 * Words that identify the real people in this repository and in any `extraRoots` (the private copies an
 * engine checkout names), example people excluded, for the leak scan.
 */
export function personalTokens(root: string, extraRoots: string[] = []): string[] {
  const out = new Set<string>();
  for (const r of [root, ...extraRoots]) for (const person of listPeople(r)) {
    for (const path of findByType(personDir(person, r), "profile")) {
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

/** The tokens `text` contains: phone digits match digits anywhere, everything else matches case-insensitively. */
export function tokensIn(text: string, tokens: string[]): string[] {
  const lower = text.toLowerCase(), digits = text.replace(/\D/g, "");
  return tokens.filter((t) => (/^\d+$/.test(t) ? digits.includes(t) : lower.includes(t.toLowerCase())));
}

/**
 * Added lines in a commit range, outside people/ and custom/, that contain a personal token. Diffs
 * are read without diff drivers, so a broken driver cannot cut the check short (Word and PDF files
 * are checked by documentsIn). Throws when git cannot produce the diff.
 */
export function leaksIn(range: string[], tokens: string[], cwd: string): { file: string; token: string }[] {
  if (!tokens.length) return [];
  const r = git(["log", "-p", "--no-textconv", "--no-ext-diff", "--format=", "--no-color", "--unified=0", ...range, "--", ".", ":(exclude)people", ":(exclude)custom"], cwd);
  if (!r.ok) throw new Error(`git could not show the changes (${r.err.split("\n")[0]})`);
  const hits: { file: string; token: string }[] = [];
  let file = "";
  for (const line of r.out.split("\n")) {
    if (line.startsWith("+++ ")) { file = line.replace(/^\+\+\+ (b\/)?/, ""); continue; }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const token of tokensIn(line, tokens)) hits.push({ file, token });
  }
  return hits.filter((h, i) => hits.findIndex((o) => o.file === h.file && o.token === h.token) === i);
}

/**
 * The text of every Word and PDF file version a push sends outside people/ and custom/ (null when
 * one cannot be read), so documents are checked for personal details as well as text files.
 */
export async function documentsIn(range: string[], cwd: string): Promise<{ file: string; text: string | null }[]> {
  const r = git(["rev-list", "--objects", ...range], cwd);
  if (!r.ok) throw new Error(`git could not list what the push sends (${r.err.split("\n")[0]})`);
  const docs = r.out.split("\n").flatMap((line) => {
    const i = line.indexOf(" ");
    const path = i > 0 ? line.slice(i + 1) : "";
    return /\.(docx|pdf)$/i.test(path) && !/^(people|custom)\//.test(path) ? [{ id: line.slice(0, i), path }] : [];
  });
  if (!docs.length) return [];
  const tmp = mkdtempSync(join(tmpdir(), "factloom-guard-"));
  try {
    const out: { file: string; text: string | null }[] = [];
    for (const d of docs) {
      const blob = spawnSync("git", ["cat-file", "blob", d.id], { cwd, maxBuffer: 1 << 30 });
      if (blob.status !== 0) { out.push({ file: d.path, text: null }); continue; }
      const file = join(tmp, `${d.id}${extname(d.path)}`);
      writeFileSync(file, blob.stdout);
      out.push({ file: d.path, text: await extractDocumentText(file) });
    }
    return out;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

type RefUpdate = { localSha: string; remoteSha: string };

/** Checks one push; returns the reasons to refuse it (empty to allow). Anything that cannot be checked is a reason. */
export async function checkPush(remoteName: string, url: string, updates: RefUpdate[], cwd: string, root = cwd): Promise<string[]> {
  const problems: string[] = [];
  const toUpstream = sameRepo(url, upstreamUrl());
  for (const u of updates) {
    if (ZERO.test(u.localSha)) continue; // deleting a branch sends no content
    const range = ZERO.test(u.remoteSha) ? [u.localSha, "--not", `--remotes=${remoteName}`] : [`${u.remoteSha}..${u.localSha}`];
    let data: string[];
    try {
      data = dataPathsIn(range, cwd);
    } catch (e) {
      problems.push(`the push could not be checked (${e instanceof Error ? e.message : String(e)}); fix that, then push again`);
      continue;
    }
    if (toUpstream) {
      if (data.length) problems.push(`this push would publish ${data.length} file(s) from people/ or custom/ to the public engine (${repoSlug(url)}), for example ${data.slice(0, 3).join(", ")}. Engine changes go from a branch based on the engine (see CONTRIBUTING.md).`);
      // The engine's own address is public by definition, even when it contains a person's link.
      const engineAddress = upstreamUrl().toLowerCase();
      const tokens = personalTokens(root, privateCopies(cwd)).filter((t) => !engineAddress.includes(t.toLowerCase()));
      if (!tokens.length) continue;
      try {
        const leaks = leaksIn(range, tokens, cwd);
        for (const d of await documentsIn(range, cwd)) {
          if (d.text === null) problems.push(`${d.file}: this document could not be read to check it for personal details (install pdftotext from poppler-utils), so check it yourself first`);
          else for (const token of tokensIn(d.text, tokens)) leaks.push({ file: d.file, token });
        }
        if (leaks.length) problems.push(`these engine changes contain personal details from a profile: ${leaks.slice(0, 5).map((l) => `${l.file} (${l.token.length > 3 ? `${l.token.slice(0, 2)}…` : "…"})`).join(", ")}. Remove them before contributing.`);
      } catch (e) {
        problems.push(`the changes could not be checked for personal details (${e instanceof Error ? e.message : String(e)}); fix that, then push again`);
      }
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

async function prePush(remoteName: string, url: string, root: string): Promise<number> {
  let input = "";
  try { if (!process.stdin.isTTY) input = readFileSync(0, "utf8"); } catch { input = ""; }
  const updates = input.split("\n").map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 4).map(([, localSha, , remoteSha]) => ({ localSha, remoteSha }));
  const problems = await checkPush(remoteName, url, updates, root);
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
  const copies = privateCopies(root);
  if (copies.length) console.log(`engine pushes are also checked against the profiles in: ${copies.join(", ")}`);
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

const USAGE = "resumes guard status | guard allow [<remote>] [--remote <remote>] [--force] | guard pre-push <remote> <url> (run by the git hook) | guard upstream (CI in the public engine)";

const command: Command = {
  name: "guard",
  summary: "Keep personal data in your private repository: the pre-push check, and which remote may receive it",
  usage: USAGE,
  async run(argv) {
    const a = parseArgs(argv, ["force"]);
    const root = repoRoot();
    switch (a._[0] ?? "status") {
      case "status": return status(root);
      case "allow": return allow(a._[1] ?? flag(a, "remote") ?? "origin", root, has(a, "force"));
      case "pre-push": return a._[1] && a._[2] ? await prePush(a._[1], a._[2], root) : (console.error(`usage: ${USAGE}`), 2);
      case "upstream": return upstreamCheck(root);
      default: console.error(`usage: ${USAGE}`); return 2;
    }
  },
};
export default command;
