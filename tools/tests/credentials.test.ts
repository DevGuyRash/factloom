// Session credentials and the onboarding questions that decide who handles accounts and codes.
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import { run } from "../src/commands/check.ts";
import command, { clearCredentials, findCredentials, saveCredentials } from "../src/commands/credentials.ts";
import { loadCatalog, openCoreQuestions } from "../src/lib/catalog.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

async function capture(fn: () => Promise<number> | number): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const log = console.log, error = console.error;
  console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { lines.push(a.join(" ")); };
  try {
    return { code: await fn(), out: lines.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("onboarding asks who handles accounts, which email they use, and who reads verification emails", () => {
  const core = new Map(loadCatalog(REAL_ROOT).filter((e) => e.core).map((e) => [e.id, e]));
  for (const id of ["accounts.handling", "accounts.email", "mail.verification"]) {
    assert.ok(core.has(id), `${id} is a core question`);
    assert.equal(core.get(id)!.policy, "confirm");
  }
  const fx = makeFixture();
  try {
    const open = openCoreQuestions("pat-lee", fx.root).map((e) => e.id);
    for (const id of ["accounts.handling", "accounts.email", "mail.verification"]) assert.ok(open.includes(id), `${id} is asked of a new person`);
  } finally {
    fx.cleanup();
  }
});

test("a session password is kept in an owner-only, git-ignored file that check accepts, status never shows, and clear removes", async () => {
  const fx = makeFixture();
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = fx.root;
  try {
    const path = saveCredentials("pat-lee", "jobs@example.com", "correct-horse-battery", fx.root);
    assert.match(path, /people\/pat-lee\/accounts\.local\.md$/, "a *.local.* file, which git ignores");
    if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600, "readable only by its owner");
    assert.equal(findCredentials("pat-lee", fx.root), path);

    const checked = await run(fx.root);
    assert.deepEqual(checked.errors, []);
    assert.ok(![...checked.errors, ...checked.warnings].some((m) => m.includes("correct-horse-battery")));

    const status = await capture(() => command.run(["status", "--person", "pat-lee"]));
    assert.match(status.out, /session password saved for jobs@example\.com/);
    assert.doesNotMatch(status.out, /correct-horse-battery/);

    const set = await capture(() => command.run(["set", "--person", "pat-lee"]));
    assert.equal(set.code, 2, "outside a terminal, set refuses rather than read a password from a pipe");
    assert.match(set.out, /run this in a terminal/);

    const cleared = await capture(() => command.run(["clear", "--person", "pat-lee"]));
    assert.match(cleared.out, /removed people\/pat-lee\/accounts\.local\.md/);
    assert.equal(findCredentials("pat-lee", fx.root), null);
    assert.deepEqual(clearCredentials("pat-lee", fx.root), [], "clearing twice is harmless");
  } finally {
    if (prev === undefined) delete process.env.RESUMES_ROOT; else process.env.RESUMES_ROOT = prev;
    fx.cleanup();
  }
});
