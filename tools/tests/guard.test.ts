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

function withTemp<T>(fn: (base: string) => T): T {
  const base = mkdtempSync(join(tmpdir(), "guard-"));
  try { return fn(base); } finally { rmSync(base, { recursive: true, force: true }); }
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

test("data goes only to the verified private remote; never to the engine; engine changes may not carry profile details", () => withTemp((base) => {
  process.env.FACTLOOM_UPSTREAM = "https://github.com/example-org/engine.git";
  try {
    const r = repo(join(base, "copy"));
    r.write("README.md", "engine\n");
    const engineOnly = r.commit("engine");
    r.write("people/pat-lee/profile.md", PROFILE);
    const withData = r.commit("pat's profile");
    const privateUrl = join(base, "private.git");

    // A new branch pushed to an unverified remote with people/ in it: refused.
    const refused = checkPush("origin", privateUrl, [{ localSha: withData, remoteSha: ZERO }], r.dir);
    assert.strictEqual(refused.length, 1);
    assert.match(refused[0], /people\/ or custom\/.*not verified as private.*guard allow origin/s);

    // Once recorded as the private data remote, the same push is allowed.
    git(["config", PRIVATE_REMOTE_KEY, privateUrl], r.dir);
    assert.deepStrictEqual(checkPush("origin", privateUrl, [{ localSha: withData, remoteSha: ZERO }], r.dir), []);

    // The engine never receives people/, whatever is configured.
    const toEngine = checkPush("upstream", upstreamUrl(), [{ localSha: withData, remoteSha: engineOnly }], r.dir);
    assert.ok(toEngine.some((p) => p.includes("public engine")), "people/ refused for the engine");

    // An engine-only change that mentions the person is refused for the engine; a clean one passes.
    r.write("docs/notes.md", "Thanks to Pat Lee-Example for the idea.\n");
    const leaky = r.commit("docs");
    assert.ok(leaksIn([`${withData}..${leaky}`], personalTokens(r.dir), r.dir).length > 0);
    assert.ok(checkPush("upstream", upstreamUrl(), [{ localSha: leaky, remoteSha: withData }], r.dir).some((p) => p.includes("personal details")));
    r.write("docs/notes.md", "Thanks for the idea.\n");
    const clean = r.commit("docs: no names");
    assert.deepStrictEqual(checkPush("upstream", upstreamUrl(), [{ localSha: clean, remoteSha: leaky }], r.dir), []);

    // Deleting a branch sends nothing.
    assert.deepStrictEqual(checkPush("upstream", upstreamUrl(), [{ localSha: ZERO, remoteSha: clean }], r.dir), []);
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

test("an engine checkout checks its pushes against the profiles of the private copies it names", () => withTemp((base) => {
  process.env.FACTLOOM_UPSTREAM = "https://github.com/example-org/engine.git";
  try {
    const mine = repo(join(base, "mine"));
    mine.write("people/pat-lee/profile.md", PROFILE);
    mine.commit("pat");
    const engine = repo(join(base, "engine"));
    engine.write("README.md", "engine\n");
    const first = engine.commit("engine");
    engine.write("docs/notes.md", "Questions go to pat.lee@example.org.\n");
    const leaky = engine.commit("docs");
    const push = () => checkPush("origin", upstreamUrl(), [{ localSha: leaky, remoteSha: first }], engine.dir);
    assert.deepStrictEqual(push(), [], "with no private copy named, the engine checkout knows no one's details");
    git(["config", "--add", PRIVATE_COPY_KEY, mine.dir], engine.dir);
    assert.ok(push().some((p) => p.includes("personal details")), "once named, the copy's profile details are refused");
  } finally {
    delete process.env.FACTLOOM_UPSTREAM;
  }
}));
