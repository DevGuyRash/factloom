import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { Command } from "../lib/command.ts";
import { peek } from "../lib/frontmatter.ts";
import { PRIVATE_REMOTE_KEY, remotes, repoSlug, ROLE_KEY, sameRepo, upstreamRemote, upstreamUrl, visibility } from "../lib/git.ts";
import { engineRoot } from "../lib/layers.ts";
import { findByType, listPeople, personDir, rel, repoRoot } from "../lib/repo.ts";
import { listVariants, loadVariant } from "../render/spec.ts";
import { loadTheme } from "../render/theme.ts";
import { missingFonts } from "./themes.ts";

/** `fatal` checks make doctor exit non-zero; `note` lines are information, not problems. */
type Check = { name: string; ok: boolean; detail: string; fix?: string; fatal?: boolean; note?: boolean };

/** People with a profile that is not marked `example: true`. */
const realPeople = (root: string): string[] =>
  listPeople(root).filter((p) => findByType(personDir(p, root), "profile").some((f) => peek(f)?.example !== true));

function which(cmd: string): boolean {
  try {
    return spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

function nodeAtLeast(major: number, minor: number): boolean {
  const m = /^v?(\d+)\.(\d+)/.exec(process.version);
  if (!m) return false;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > major || (maj === major && min >= minor);
}

function run(cmd: string, args: string[], cwd?: string): { ok: boolean; stdout: string } {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
    return { ok: r.status === 0, stdout: (r.stdout ?? "").trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/** `doctor`: environment, privacy, and font checks. Exits non-zero when Node is too old or real people's data sits in a public repository. */
const command: Command = {
  name: "doctor",
  summary: "Check the environment, the push guard, privacy of your repository, and fonts your themes need",
  usage: "resumes doctor",
  run() {
    const root = repoRoot();
    const checks: Check[] = [];

    const nodeOk = nodeAtLeast(22, 18);
    checks.push({ name: "node", ok: nodeOk, detail: process.version, fix: "install Node >= 22.18 (https://nodejs.org)" });

    const modulesOk = existsSync(join(engineRoot(), "tools", "node_modules"));
    checks.push({ name: "tools/node_modules", ok: modulesOk, detail: modulesOk ? "present" : "missing", fix: "run `npm install` in tools/" });

    const sofficeOk = existsSync("/usr/bin/soffice") || which("soffice");
    checks.push({ name: "soffice", ok: sofficeOk, detail: sofficeOk ? "found" : "not found", fix: "install LibreOffice for PDF output" });

    const pandocOk = which("pandoc");
    checks.push({ name: "pandoc", ok: pandocOk, detail: pandocOk ? "found" : "not found", fix: "install pandoc" });

    const pdftotextOk = which("pdftotext");
    checks.push({ name: "pdftotext", ok: pdftotextOk, detail: pdftotextOk ? "found" : "not found", fix: "install poppler-utils" });

    const hooks = run("git", ["config", "--get", "core.hooksPath"], root);
    checks.push({
      name: "git hooks path", ok: which("git"),
      detail: hooks.stdout ? `core.hooksPath=${hooks.stdout}` : "not set (using .git/hooks)",
      fix: "install git",
    });

    const gh = run("gh", ["auth", "status"]);
    checks.push({ name: "gh auth status", ok: gh.ok, detail: gh.ok ? "logged in" : "not logged in (or gh not installed)", fix: "run `gh auth login`, or install the GitHub CLI" });

    const himalayaOk = which("himalaya");
    checks.push({ name: "himalaya (optional, email)", ok: himalayaOk, detail: himalayaOk ? "found" : "not found", fix: "install the himalaya email CLI for mailbox access: https://github.com/pimalaya/himalaya" });

    // Privacy: real people's data belongs only in a private repository.
    const people = realPeople(root);
    const inGit = run("git", ["rev-parse", "--is-inside-work-tree"], root).ok;
    if (inGit) {
      if (run("git", ["config", "--get", ROLE_KEY], root).stdout === "engine") {
        checks.push({ name: "checkout", ok: true, note: true, detail: "for working on factloom itself (AGENTS.md, \"Working on the engine\")" });
      }
      const hookOn = hooks.stdout === ".githooks" && existsSync(join(root, ".githooks", "pre-push"));
      checks.push({ name: "push guard", ok: hookOn, detail: hookOn ? "on: people/ and custom/ go only to your private repository" : "off", fix: "run ./resumes setup" });
      const up = upstreamRemote(root);
      checks.push(up
        ? { name: "engine remote", ok: true, note: true, detail: `${up.name} → ${repoSlug(up.fetch)} (updates: ./resumes update)` }
        : { name: "engine remote", ok: false, detail: "none", fix: "run ./resumes setup (adds it for ./resumes update)" });
      const origin = remotes(root).find((r) => r.name === "origin");
      if (people.length && origin) {
        const isEngine = sameRepo(origin.fetch, upstreamUrl());
        const vis = isEngine ? "PUBLIC" : visibility(origin.fetch, root);
        const exposed = vis === "PUBLIC";
        const where = isEngine ? `origin is the public engine (${repoSlug(origin.fetch)})` : `origin (${repoSlug(origin.fetch)}) is public`;
        checks.push({
          name: "privacy", ok: !exposed, fatal: exposed,
          detail: exposed ? `${where} and people/ holds ${people.length} real person(s)` : `origin (${repoSlug(origin.fetch)}) is ${vis ? vis.toLowerCase() : "not verifiable (GitHub CLI unavailable)"}`,
          fix: sameRepo(origin.fetch, upstreamUrl()) ? "this checkout still points at the public engine: run ./resumes setup --private-repo <name>" : "make the repository private on GitHub (Settings, Change visibility) before pushing again",
        });
        const allowed = run("git", ["config", "--get", PRIVATE_REMOTE_KEY], root).stdout;
        checks.push({ name: "private data remote", ok: Boolean(allowed), detail: allowed ? repoSlug(allowed) : "not set: pushes of people/ are refused until it is", fix: "./resumes guard allow origin (after making origin private)" });
      }
    }

    // A password file left behind after a session ends.
    for (const p of listPeople(root)) {
      for (const file of findByType(personDir(p, root), "session-credentials")) {
        checks.push({ name: "session credentials", ok: true, note: true, detail: `${rel(file, root)} holds a password for one session`, fix: "./resumes credentials clear once that session is over" });
      }
    }

    // Fonts the themes in use need, so PDFs made here look as designed.
    const fontNotes = new Map<string, string>();
    for (const p of listPeople(root)) {
      for (const v of (() => { try { return listVariants(p, root); } catch { return []; } })()) {
        try {
          const variant = loadVariant(p, v, root);
          for (const m of missingFonts(loadTheme(variant.theme, root, { person: p, overrides: variant.style }))) fontNotes.set(m.font, m.substitute);
        } catch { /* a broken variant is check's to report */ }
      }
    }
    if (fontNotes.size) checks.push({ name: "theme fonts", ok: true, note: true, detail: [...fontNotes].map(([f, s]) => `${f} not installed (PDFs use ${s})`).join("; "), fix: "install the fonts for PDFs that match the design" });

    for (const c of checks) console.log(`${c.note ? "[NOTE]   " : c.ok ? "[OK]     " : c.fatal ? "[DANGER] " : "[MISSING]"} ${c.name}: ${c.detail}${(!c.ok || c.note) && c.fix ? ` — fix: ${c.fix}` : ""}`);
    return nodeOk && !checks.some((c) => c.fatal && !c.ok) ? 0 : 1;
  },
};
export default command;
