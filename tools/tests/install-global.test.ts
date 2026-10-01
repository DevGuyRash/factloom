import assert from "node:assert";
import test from "node:test";
import { lstatSync, mkdtempSync, readlinkSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyLinks, planLinks } from "../src/lib/install.ts";
import installGlobalCmd from "../src/commands/install-global.ts";
import { makeFixture } from "./helpers/fixture.ts";

function tempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "resumes-home-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("planLinks proposes creating both links when neither exists", () => {
  const { home, cleanup } = tempHome();
  try {
    const plans = planLinks("/repo", home);
    assert.equal(plans.length, 2);
    assert.ok(plans.every((p) => p.action === "create"));
  } finally {
    cleanup();
  }
});

test("applyLinks creates real symlinks to the repo's skill directory, and a second plan sees them as already linked", () => {
  const { home, cleanup } = tempHome();
  try {
    const target = join(home, "repo", ".agents", "skills", "job-application");
    mkdirSync(target, { recursive: true });
    const plans = planLinks(join(home, "repo"), home);
    const results = applyLinks(plans);
    assert.ok(results.every((r) => r.applied));
    for (const r of results) {
      const st = lstatSync(r.link);
      assert.ok(st.isSymbolicLink());
      assert.equal(readlinkSync(r.link), target);
    }
    const again = planLinks(join(home, "repo"), home);
    assert.ok(again.every((p) => p.action === "already-linked"));
  } finally {
    cleanup();
  }
});

test("a real directory already at the link path is left untouched (blocked, not overwritten)", () => {
  const { home, cleanup } = tempHome();
  try {
    const linkPath = join(home, ".agents", "skills", "job-application");
    mkdirSync(linkPath, { recursive: true });
    const plans = planLinks(join(home, "repo"), home);
    const blocked = plans.find((p) => p.link === linkPath)!;
    assert.equal(blocked.action, "blocked");
    const results = applyLinks(plans);
    const r = results.find((x) => x.link === linkPath)!;
    assert.equal(r.applied, false);
    assert.ok(lstatSync(linkPath).isDirectory());
  } finally {
    cleanup();
  }
});

test("--remove removes a link this tool created but never touches a blocked real directory", () => {
  const { home, cleanup } = tempHome();
  try {
    const target = join(home, "repo", ".agents", "skills", "job-application");
    mkdirSync(target, { recursive: true });
    applyLinks(planLinks(join(home, "repo"), home));
    const removePlans = planLinks(join(home, "repo"), home, true);
    assert.ok(removePlans.every((p) => p.action === "remove"));
    const results = applyLinks(removePlans);
    assert.ok(results.every((r) => r.applied));
    assert.equal(planLinks(join(home, "repo"), home, true).every((p) => p.action === "already-absent"), true);
  } finally {
    cleanup();
  }
});

test("install-global command: dry run by default, creates links under --apply against a temp HOME only", () => {
  const fx = makeFixture();
  mkdirSync(join(fx.root, ".agents", "skills", "job-application"), { recursive: true });
  const { home, cleanup } = tempHome();
  const prevRoot = process.env.RESUMES_ROOT;
  const prevHome = process.env.HOME;
  process.env.RESUMES_ROOT = fx.root;
  process.env.HOME = home;
  try {
    const dryCode = installGlobalCmd.run([]);
    assert.equal(dryCode, 0);
    assert.throws(() => lstatSync(join(home, ".agents", "skills", "job-application")));

    const applyCode = installGlobalCmd.run(["--apply"]);
    assert.equal(applyCode, 0);
    const st = lstatSync(join(home, ".agents", "skills", "job-application"));
    assert.ok(st.isSymbolicLink());
  } finally {
    if (prevRoot === undefined) delete process.env.RESUMES_ROOT; else process.env.RESUMES_ROOT = prevRoot;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    fx.cleanup();
    cleanup();
  }
});
