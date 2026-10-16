// Git and GitHub helpers for setup, update, and the push guard. Every call is local except the `gh`
// ones, which only read a repository's visibility.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { engineRoot } from "./layers.ts";

export type Run = { ok: boolean; out: string; err: string };

export function git(args: string[], cwd: string, input?: string): Run {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", input, maxBuffer: 1 << 30 });
  return { ok: r.status === 0 && !r.error, out: (r.stdout ?? "").trim(), err: (r.stderr || r.error?.message || "").trim() };
}

export function gh(args: string[], cwd: string): Run {
  const r = spawnSync("gh", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0 && !r.error, out: (r.stdout ?? "").trim(), err: (r.stderr ?? r.error?.message ?? "").trim() };
}

/** Known GitHub authorities, with a slug only when the transport and repository path are understood. */
export function githubDestination(address: string): { slug?: string } | undefined {
  const value = address.trim();
  let path: string;
  const scp = /^(?:[^/@:\s]+@)?((?:ssh\.)?github\.com\.?):([^\s]*)$/i.exec(value);
  if (scp) {
    // A trailing DNS dot and ssh.github.com without an explicit port remain hosted, but unverified.
    if (scp[1].toLowerCase() !== "github.com") return {};
    path = scp[2];
  }
  else {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (!["github.com", "github.com.", "ssh.github.com", "ssh.github.com."].includes(host)) return undefined;
      if (host.endsWith(".") || (host === "ssh.github.com" && (url.protocol !== "ssh:" || url.port !== "443"))) return {};
      const port = host === "ssh.github.com" ? "443" : { "ssh:": "22", "git:": "9418" }[url.protocol];
      if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol) || url.search || url.hash || (url.port && url.port !== port)) return {};
      path = url.pathname.replace(/^\//, "");
    } catch { return undefined; }
  }
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(path);
  return match ? { slug: `${match[1]}/${match[2]}`.toLowerCase() } : {};
}

/** GitHub URLs become lower-case owner/name; other URLs and paths keep their case. */
export function repoSlug(url: string): string {
  return githubDestination(url)?.slug ?? url.trim().replace(/\/$/, "").replace(/\.git$/, "");
}

export function sameRepo(a: string, b: string): boolean {
  if (!a || !b) return false;
  const githubA = githubDestination(a), githubB = githubDestination(b);
  return githubA || githubB ? Boolean(githubA?.slug && githubB?.slug && githubA.slug === githubB.slug) : repoSlug(a) === repoSlug(b);
}

/**
 * The engine repository updates come from: FACTLOOM_UPSTREAM when set (an organization's own fork,
 * or a test), else tools/package.json `repository.url`.
 */
export function upstreamUrl(): string {
  if (process.env.FACTLOOM_UPSTREAM) return process.env.FACTLOOM_UPSTREAM;
  const pkg = JSON.parse(readFileSync(join(engineRoot(), "tools", "package.json"), "utf8")) as { repository?: { url?: string } | string };
  const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (!url) throw new Error("tools/package.json has no repository.url");
  return url;
}

export type Remote = { name: string; fetch: string; push: string };

export function remotes(cwd: string): Remote[] {
  const out = new Map<string, Remote>();
  for (const line of git(["remote", "-v"], cwd).out.split("\n").filter(Boolean)) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const r = out.get(m[1]) ?? { name: m[1], fetch: "", push: "" };
    r[m[3] as "fetch" | "push"] = m[2];
    out.set(m[1], r);
  }
  return [...out.values()];
}

/** The remote whose fetch URL is the public engine, if any. */
export const upstreamRemote = (cwd: string): Remote | undefined => remotes(cwd).find((r) => sameRepo(r.fetch, upstreamUrl()));

/** A GitHub repository's visibility ("PUBLIC", "PRIVATE", "INTERNAL"), or undefined when gh cannot tell. */
export function visibility(url: string, cwd: string): string | undefined {
  const slug = githubDestination(url)?.slug;
  if (!slug) return undefined;
  const r = gh(["repo", "view", slug, "--json", "visibility", "-q", ".visibility"], cwd);
  return r.ok && r.out ? r.out.toUpperCase() : undefined;
}

/** The chosen private destination; GitHub visibility is still verified at each push. */
export const PRIVATE_REMOTE_KEY = "factloom.privateRemote";

/**
 * The git config key, one value per path, naming people's private copies whose profiles the push
 * guard checks an engine checkout's pushes against (an engine checkout has no profiles of its own).
 */
export const PRIVATE_COPY_KEY = "factloom.privateCopy";

/** The private copies this checkout names (factloom.privateCopy) that exist on this machine. */
export function privateCopies(cwd: string): string[] {
  return git(["config", "--type=path", "--get-all", PRIVATE_COPY_KEY], cwd).out.split("\n").map((s) => s.trim()).filter((p) => p && existsSync(p));
}

/** The git config key marking a checkout for working on the engine itself (`./resumes setup --engine`). */
export const ROLE_KEY = "factloom.role";

/** The push URL of the engine remote in a person's copy, so nothing is ever pushed to it. */
export const DISABLED_PUSH = "no-push--the-engine-takes-changes-through-pull-requests";

/** Names tried, in order, for the engine remote; the first one not already in use is taken. */
const ENGINE_REMOTE_NAMES = ["upstream", "factloom", "factloom-engine"];

/** A name for the engine remote that this checkout does not use yet, or undefined. */
export function freeRemoteName(cwd: string): string | undefined {
  const taken = new Set(remotes(cwd).map((r) => r.name));
  return ENGINE_REMOTE_NAMES.find((n) => !taken.has(n));
}

/**
 * The remote to update from: the one whose fetch URL is the engine, else a new fetch-only one under a
 * free name. A remote that points anywhere else is never changed.
 */
export function ensureUpstreamRemote(cwd: string): { remote: Remote; added?: string } | { error: string } {
  const existing = upstreamRemote(cwd);
  if (existing) return { remote: existing };
  const name = freeRemoteName(cwd);
  if (!name) return { error: `remotes named ${ENGINE_REMOTE_NAMES.join(", ")} already point elsewhere; add the engine yourself: git remote add <name> ${upstreamUrl()}` };
  const added = git(["remote", "add", name, upstreamUrl()], cwd);
  if (added.ok) git(["remote", "set-url", "--push", name, DISABLED_PUSH], cwd);
  const remote = upstreamRemote(cwd);
  if (!added.ok || !remote) return { error: `could not add the engine as remote ${name}: ${added.err || "unknown error"}` };
  return { remote, added: name };
}

/** Paths under people/ and custom/ that the public engine itself ships (and so may be pushed anywhere). */
export const ENGINE_OWNED_DATA = new Set(["people/.gitkeep", "custom/README.md"]);

/** Paths a commit range touches under people/ or custom/, beyond the files the engine itself ships. Throws when git cannot tell. */
export function dataPathsIn(range: string[], cwd: string): string[] {
  const r = git(["log", "--format=", "--name-only", ...range, "--", "people", "custom"], cwd);
  if (!r.ok) throw new Error(`git could not list the changed files (${r.err.split("\n")[0]})`);
  return [...new Set(r.out.split("\n").map((s) => s.trim()).filter((p) => p && !ENGINE_OWNED_DATA.has(p)))].sort();
}
