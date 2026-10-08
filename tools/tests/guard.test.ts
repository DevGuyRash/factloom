// The push guard and engine updates, against real throwaway git repositories (no network: the engine
// is a local repository named by FACTLOOM_UPSTREAM).
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkPush, leaksIn, personalTokens } from "../src/commands/guard.ts";
import { updateFrom } from "../src/commands/update.ts";
import { DISABLED_PUSH, ensureUpstreamRemote, git, PRIVATE_COPY_KEY, PRIVATE_REMOTE_KEY, upstreamUrl } from "../src/lib/git.ts";
import { REAL_ROOT } from "./helpers/fixture.ts";

const ZERO = "0".repeat(40);

function repo(dir: string): { dir: string; write: (rel: string, text: string) => void; commit: (msg: string) => string } {
  mkdirSync(dir, { recursive: true });
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  run("init", "-q", "-b", "main");
  run("config", "user.email", "test@example.com");
  run("config", "user.name", "Test");
  run("config", "commit.gpgsign", "false");
  return {
    dir,
    write: (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); },
    commit: (msg) => { run("add", "-A"); run("commit", "-q", "-m", msg); return run("rev-parse", "HEAD"); },
  };
}

async function withTemp<T>(fn: (base: string) => T | Promise<T>): Promise<T> {
  const base = mkdtempSync(join(tmpdir(), "guard-"));
  try { return await fn(base); } finally { rmSync(base, { recursive: true, force: true }); }
}

const PROFILE = "---\ntype: profile\nperson: pat-lee\nname: Pat Lee-Example\nemail: pat.lee@example.org\nphone: (555) 010-7788\nlinks:\n  - https://example.org/patlee\napply: enabled\n---\n";

test("personal tokens come from real profiles only: name, its longer parts, email, phone digits, links", () => withTemp((base) => {
  const r = repo(join(base, "copy"));
  r.write("people/pat-lee/profile.md", PROFILE);
  r.write("people/demo-person/profile.md", "---\ntype: profile\nperson: demo-person\nname: Demo Person\napply: disabled\nexample: true\n---\n");
  const tokens = personalTokens(r.dir);
  for (const t of ["Pat Lee-Example", "Lee-Example", "pat.lee@example.org", "0107788", "example.org/patlee", "pat-lee"]) assert.ok(tokens.includes(t), t);
  assert.ok(!tokens.some((t) => t.includes("Demo")), "example people are not personal");
}));

test("data goes only to the verified private remote; never to the engine; engine changes may not carry profile details", () => withTemp(async (base) => {
  process.env.FACTLOOM_UPSTREAM = "https://github.com/example-org/engine.git";
  try {
    const r = repo(join(base, "copy"));
    r.write("README.md", "engine\n");
    const engineOnly = r.commit("engine");
    r.write("people/pat-lee/profile.md", PROFILE);
    const withData = r.commit("pat's profile");
    const privateUrl = join(base, "private.git");

    // A new branch pushed to an unverified remote with people/ in it: refused.
    const refused = await checkPush("origin", privateUrl, [{ localSha: withData, remoteSha: ZERO }], r.dir);
    assert.strictEqual(refused.length, 1);
    assert.match(refused[0], /people\/ or custom\/.*not verified as private.*guard allow origin/s);

    // Once recorded as the private data remote, the same push is allowed.
    git(["config", PRIVATE_REMOTE_KEY, privateUrl], r.dir);
    assert.deepStrictEqual(await checkPush("origin", privateUrl, [{ localSha: withData, remoteSha: ZERO }], r.dir), []);

    // The engine never receives people/, whatever is configured.
    const toEngine = await checkPush("upstream", upstreamUrl(), [{ localSha: withData, remoteSha: engineOnly }], r.dir);
    assert.ok(toEngine.some((p) => p.includes("public engine")), "people/ refused for the engine");

    // An engine-only change that mentions the person is refused for the engine; a clean one passes.
    r.write("docs/notes.md", "Thanks to Pat Lee-Example for the idea.\n");
    const leaky = r.commit("docs");
    assert.ok(leaksIn([`${withData}..${leaky}`], personalTokens(r.dir), r.dir).length > 0);
    assert.ok((await checkPush("upstream", upstreamUrl(), [{ localSha: leaky, remoteSha: withData }], r.dir)).some((p) => p.includes("personal details")));
    r.write("docs/notes.md", "Thanks for the idea.\n");
    const clean = r.commit("docs: no names");
    assert.deepStrictEqual(await checkPush("upstream", upstreamUrl(), [{ localSha: clean, remoteSha: leaky }], r.dir), []);

    // Deleting a branch sends nothing.
    assert.deepStrictEqual(await checkPush("upstream", upstreamUrl(), [{ localSha: ZERO, remoteSha: clean }], r.dir), []);
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("update merges the engine, refuses after local engine edits, and links an unrelated copy once", () => withTemp((base) => {
  const engine = repo(join(base, "engine"));
  engine.write("AGENTS.md", "# engine\n");
  engine.write("people/.gitkeep", "");
  engine.write("shared/a.txt", "one\n");
  engine.write("tools/x.txt", "tool v1\n");
  engine.commit("engine v1");
  process.env.FACTLOOM_UPSTREAM = engine.dir;
  try {
    execFileSync("git", ["clone", "-q", engine.dir, join(base, "copy")]);
    const copyDir = join(base, "copy");
    for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) execFileSync("git", ["config", k, v], { cwd: copyDir });
    writeFileSync(join(copyDir, "people", "note.md"), "mine\n");
    execFileSync("git", ["add", "-A"], { cwd: copyDir }); execFileSync("git", ["commit", "-q", "-m", "my data"], { cwd: copyDir });

    assert.strictEqual(updateFrom(copyDir).status, "up-to-date");
    engine.write("shared/a.txt", "two\n");
    engine.commit("engine v2");
    const dry = updateFrom(copyDir, { dryRun: true });
    assert.strictEqual(dry.status, "dry-run");
    const updated = updateFrom(copyDir);
    assert.strictEqual(updated.status, "updated");
    assert.strictEqual(readFileSync(join(copyDir, "shared", "a.txt"), "utf8"), "two\n");
    assert.strictEqual(readFileSync(join(copyDir, "people", "note.md"), "utf8"), "mine\n", "people/ is untouched");

    // A local edit to an engine file blocks the next update and names the file.
    writeFileSync(join(copyDir, "tools", "x.txt"), "my tweak\n");
    execFileSync("git", ["commit", "-q", "-am", "tweak the engine"], { cwd: copyDir });
    engine.write("shared/a.txt", "three\n");
    engine.commit("engine v3");
    const blocked = updateFrom(copyDir);
    assert.strictEqual(blocked.status, "edited");
    assert.deepStrictEqual("files" in blocked ? blocked.files : [], ["tools/x.txt"]);

    // A copy with its own history links once, taking the engine's files and keeping people/.
    const old = repo(join(base, "old"));
    old.write("people/pat/profile.md", "pat\n");
    old.write("tools/x.txt", "an old tool\n");
    old.write("tools/old.py", "print('old')\n");
    old.commit("before factloom");
    execFileSync("git", ["remote", "add", "upstream", engine.dir], { cwd: old.dir });
    assert.strictEqual(updateFrom(old.dir).status, "no-history");
    const linked = updateFrom(old.dir, { link: true });
    assert.strictEqual(linked.status, "linked");
    assert.strictEqual(readFileSync(join(old.dir, "tools", "x.txt"), "utf8"), "tool v1\n", "the engine's version of an engine file wins");
    assert.strictEqual(readFileSync(join(old.dir, "people", "pat", "profile.md"), "utf8"), "pat\n");
    assert.deepStrictEqual("extra" in linked ? linked.extra : [], ["tools/old.py"], "engine-area files the engine lacks are listed, not deleted");
    assert.strictEqual(updateFrom(old.dir).status, "up-to-date", "after linking, updates work normally");
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("update leaves modified records where they are and keeps staged ones out of the merge; engine edits stop it, and a working activation stops it only mid-commit", () => withTemp((base) => {
  const engine = repo(join(base, "engine"));
  engine.write("AGENTS.md", "# engine\n");
  engine.write("people/.gitkeep", "");
  engine.write("shared/a.txt", "one\n");
  engine.commit("engine v1");
  process.env.FACTLOOM_UPSTREAM = engine.dir;
  try {
    const copyDir = join(base, "copy");
    execFileSync("git", ["clone", "-q", engine.dir, copyDir]);
    const run = (...args: string[]) => execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd: copyDir, encoding: "utf8" }).trim();
    for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) run("config", k, v);
    mkdirSync(join(copyDir, "people", "pat"), { recursive: true });
    writeFileSync(join(copyDir, "people", "pat", "note.md"), "one\n");
    run("add", "-A");
    run("commit", "-q", "-m", "my data");
    engine.write("shared/a.txt", "two\n");
    engine.commit("engine v2");

    // An edited record, and new ones staged for a commit (one with accents and a space in its name), as an activation
    // that ended before committing leaves them.
    writeFileSync(join(copyDir, "people", "pat", "note.md"), "one, edited\n");
    writeFileSync(join(copyDir, "people", "pat", "handoff.md"), "new\n");
    writeFileSync(join(copyDir, "people", "pat", "résumé notes.md"), "accents and a space\n");
    run("add", "people/pat/handoff.md", "people/pat/résumé notes.md");
    const updated = updateFrom(copyDir);
    assert.strictEqual(updated.status, "updated", updated.message);
    assert.deepStrictEqual("staged" in updated ? [...(updated.staged ?? [])].sort() : [], ["people/pat/handoff.md", "people/pat/résumé notes.md"]);
    assert.strictEqual(readFileSync(join(copyDir, "shared", "a.txt"), "utf8"), "two\n", "the engine change is merged");
    assert.strictEqual(readFileSync(join(copyDir, "people", "pat", "note.md"), "utf8"), "one, edited\n", "the edited record was not touched");
    assert.strictEqual(run("diff", "--name-only"), "people/pat/note.md", "and is still only modified, not staged");
    assert.strictEqual(run("diff", "--cached", "--name-only"), "people/pat/handoff.md\npeople/pat/résumé notes.md", "the staged records are staged again");
    assert.strictEqual(run("diff", "--name-only", "HEAD^1", "HEAD"), "shared/a.txt", "the merge commit holds only the engine");
    assert.strictEqual(run("stash", "list"), "", "nothing was stashed");

    // An uncommitted change to an engine file stops the update and is named.
    engine.write("shared/a.txt", "three\n");
    engine.commit("engine v3");
    writeFileSync(join(copyDir, "AGENTS.md"), "# my tweak\n");
    const dirty = updateFrom(copyDir);
    assert.strictEqual(dirty.status, "dirty");
    assert.deepStrictEqual("files" in dirty ? dirty.files : [], ["AGENTS.md"]);
    run("checkout", "--", "AGENTS.md");
    run("reset", "-q");

    // An activation at work with records merely modified does not stop it: the merge cannot touch them.
    mkdirSync(join(copyDir, "people", "pat", "runs"), { recursive: true });
    writeFileSync(join(copyDir, "people", "pat", "runs", "2026-10-07_0900.md"), "---\ntype: run-log\nperson: pat\nstarted: 2026-10-07T09:00:00.000Z\nstatus: running\ncounts:\n  submitted: 0\n  held: 0\n  skipped: 0\n  errors: 0\n---\n");
    const working = updateFrom(copyDir);
    assert.strictEqual(working.status, "updated", working.message);
    assert.strictEqual(readFileSync(join(copyDir, "shared", "a.txt"), "utf8"), "three\n");
    assert.strictEqual(readFileSync(join(copyDir, "people", "pat", "note.md"), "utf8"), "one, edited\n");

    // Staged records while an activation is at work are probably mid-commit: it waits, and moves nothing.
    engine.write("shared/a.txt", "four\n");
    engine.commit("engine v4");
    writeFileSync(join(copyDir, "people", "pat", "mid-commit.md"), "staged just now\n");
    run("add", "people/pat/mid-commit.md");
    assert.strictEqual(updateFrom(copyDir).status, "busy");
    assert.strictEqual(readFileSync(join(copyDir, "shared", "a.txt"), "utf8"), "three\n", "nothing was merged");
    assert.ok(run("diff", "--cached", "--name-only").includes("people/pat/mid-commit.md"), "the staged record was left staged");
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("the engine remote is added under a free name and never takes over a remote that points elsewhere", () => withTemp((base) => {
  const engine = repo(join(base, "engine"));
  engine.write("AGENTS.md", "# engine\n");
  engine.commit("engine");
  process.env.FACTLOOM_UPSTREAM = engine.dir;
  try {
    const copy = repo(join(base, "copy"));
    copy.write("people/pat/profile.md", "pat\n");
    copy.commit("mine");
    const elsewhere = join(base, "elsewhere.git");
    execFileSync("git", ["remote", "add", "upstream", elsewhere], { cwd: copy.dir });
    const first = ensureUpstreamRemote(copy.dir);
    assert.ok(!("error" in first) && first.added === "factloom" && first.remote.name === "factloom", "added as factloom, since upstream is taken");
    assert.strictEqual(git(["remote", "get-url", "upstream"], copy.dir).out, elsewhere, "the other remote's fetch URL is unchanged");
    assert.strictEqual(git(["remote", "get-url", "--push", "upstream"], copy.dir).out, elsewhere, "and so is its push URL");
    assert.strictEqual(git(["remote", "get-url", "--push", "factloom"], copy.dir).out, DISABLED_PUSH, "nothing is ever pushed to the engine remote");
    const again = ensureUpstreamRemote(copy.dir);
    assert.ok(!("error" in again) && again.remote.name === "factloom" && again.added === undefined, "found the second time, not added again");
    assert.strictEqual(updateFrom(copy.dir).status, "no-history", "update goes through the engine remote it found");
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("an engine checkout checks its pushes against the profiles of the private copies it names", () => withTemp(async (base) => {
  process.env.FACTLOOM_UPSTREAM = "https://github.com/example-org/engine.git";
  try {
    const mine = repo(join(base, "mine"));
    mine.write("people/pat-lee/profile.md", PROFILE.replace("  - https://example.org/patlee\n", "  - https://example.org/patlee\n  - https://github.com/example-org\n"));
    mine.commit("pat");
    const engine = repo(join(base, "engine"));
    engine.write("README.md", "engine\n");
    const first = engine.commit("engine");
    engine.write("README.md", "engine\n\ngit clone https://github.com/example-org/engine.git\n");
    const ownAddress = engine.commit("readme: clone command");
    engine.write("docs/notes.md", "Questions go to pat.lee@example.org.\n");
    const leaky = engine.commit("docs");
    const push = (from: string, to: string) => checkPush("origin", upstreamUrl(), [{ localSha: to, remoteSha: from }], engine.dir);
    assert.deepStrictEqual(await push(ownAddress, leaky), [], "with no private copy named, the engine checkout knows no one's details");
    git(["config", "--add", PRIVATE_COPY_KEY, mine.dir], engine.dir);
    assert.ok((await push(ownAddress, leaky)).some((p) => p.includes("personal details")), "once named, the copy's profile details are refused");
    assert.deepStrictEqual(await push(first, ownAddress), [], "the engine's own address is not a leak, though the profile links to its owner");
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("Word and PDF files bound for the engine are checked for personal details too", () => withTemp(async (base) => {
  process.env.FACTLOOM_UPSTREAM = "https://github.com/example-org/engine.git";
  try {
    const mine = repo(join(base, "mine"));
    mine.write("people/pat-lee/profile.md", PROFILE);
    mine.commit("pat");
    const engine = repo(join(base, "engine"));
    git(["config", "--add", PRIVATE_COPY_KEY, mine.dir], engine.dir);
    engine.write("README.md", "engine\n");
    const first = engine.commit("engine");
    const { Document, Packer, Paragraph } = await import("docx");
    const docx = (text: string) => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));
    writeFileSync(join(engine.dir, "sample.docx"), await docx("A sample resume for a made-up person."));
    const clean = engine.commit("a clean sample");
    assert.deepStrictEqual(await checkPush("origin", upstreamUrl(), [{ localSha: clean, remoteSha: first }], engine.dir), []);
    writeFileSync(join(engine.dir, "sample.docx"), await docx("Contact pat.lee@example.org"));
    const leaky = engine.commit("a sample with a real email");
    const problems = await checkPush("origin", upstreamUrl(), [{ localSha: leaky, remoteSha: clean }], engine.dir);
    assert.ok(problems.some((p) => p.includes("personal details") && p.includes("sample.docx")), problems.join("; "));
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("a broken diff driver cannot cut the leak check short", () => withTemp(async (base) => {
  process.env.FACTLOOM_UPSTREAM = "https://github.com/example-org/engine.git";
  try {
    const mine = repo(join(base, "mine"));
    mine.write("people/pat-lee/profile.md", PROFILE);
    mine.commit("pat");
    const engine = repo(join(base, "engine"));
    git(["config", "--add", PRIVATE_COPY_KEY, mine.dir], engine.dir);
    git(["config", "diff.pdf.textconv", "false"], engine.dir);
    engine.write(".gitattributes", "*.pdf binary diff=pdf\n");
    engine.write("README.md", "engine\n");
    const first = engine.commit("engine");
    engine.write("docs/notes.md", "Questions go to pat.lee@example.org.\n");
    engine.commit("an older commit with a leak");
    writeFileSync(join(engine.dir, "sample.pdf"), readFileSync(join(REAL_ROOT, "examples", "demo", "people", "jordan-rivera", "resumes", "active", "data-analyst", "Jordan_Rivera_Resume.pdf")));
    const tip = engine.commit("a newer commit with a PDF, whose diff driver fails");
    const problems = await checkPush("origin", upstreamUrl(), [{ localSha: tip, remoteSha: first }], engine.dir);
    assert.ok(problems.some((p) => p.includes("personal details") && p.includes("docs/notes.md")), problems.join("; "));
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));

test("a push that cannot be read is refused rather than allowed", () => withTemp(async (base) => {
  const r = repo(join(base, "copy"));
  r.write("README.md", "x\n");
  r.commit("x");
  const problems = await checkPush("origin", join(base, "elsewhere.git"), [{ localSha: "f".repeat(40), remoteSha: ZERO }], r.dir);
  assert.ok(problems.some((p) => p.includes("could not be checked")), problems.join("; "));
}));
