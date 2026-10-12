// Public CLI regressions for transitions with unknown dates, terminal reminders, and safe retry.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

function fixture(fn: (fx: ReturnType<typeof makeFixture>, cli: (args: string[], expected?: number) => string) => void) {
  return () => {
    const fx = makeFixture();
    const cli = (args: string[], expected = 0) => {
      const r = spawnSync(process.execPath, [join(REAL_ROOT, "tools/src/cli.ts"), ...args, "--person", "pat-lee"], {
        cwd: fx.root, env: { ...process.env, RESUMES_ROOT: fx.root }, encoding: "utf8",
      });
      assert.equal(r.status, expected, `${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
      return r.stdout;
    };
    try { fn(fx, cli); } finally { fx.cleanup(); }
  };
}

test("CLI retains known interaction counts after hired and custom outcomes without inventing applied dates", fixture((fx, cli) => {
  const dir = cli(["app", "new", "--company", "Example Works", "--role", "Analyst"]).trim();
  const record = () => JSON.parse(cli(["export", "--format", "json"]))[0];
  cli(["outcome", dir, "interviewing", "--on", "2025-03-01"]);
  const before = cli(["stats"]);
  for (const status of ["hired", "started", "not-hired", "withdrawn", "work-not-available"]) {
    cli(["outcome", dir, status, "--on", "2025-03-02"]);
    assert.equal(cli(["stats"]), before, `${status} must retain the known response/interview`);
    assert.equal(record().applied, undefined);
    assert.equal(record().date_contacted, undefined);
  }
  cli(["outcome", dir, "talent-pool", "--custom", "--on", "2025-03-03"]);
  assert.equal(cli(["stats"]), before, "historical evidence survives a custom current status");
  assert.equal(record().applied, undefined);
  cli(["dashboard"]);
  const dashboard = readFileSync(join(fx.root, "people/pat-lee/dashboard.md"), "utf8");
  assert.match(dashboard, /Submission date unknown: 1 application/);
  const weeks = dashboard.split("## Applications per week")[1].split("## Held")[0];
  assert.doesNotMatch(weeks, /\| \d{4}-\d{2}-\d{2} \|/, "record creation is not a submission date");
  const other = cli(["app", "new", "--company", "Closed Posting", "--role", "Engineer"]).trim();
  cli(["outcome", other, "work-not-available"]);
  assert.equal(cli(["stats"]), before, "a closed posting alone is not evidence of submission");
  assert.ok(existsSync(join(fx.root, dir, "record.md")));
}));

test("CLI suppresses terminal pending reminders while retaining the pending information and event history", fixture((_fx, cli) => {
  const dir = cli(["app", "new", "--company", "Example Works", "--role", "Analyst"]).trim();
  cli(["app", "submit", dir, "--no-log"]);
  cli(["app", "hold", dir, "--reason", "Pending assessment", "--due", "2099-03-01", "--no-log"]);
  assert.match(cli(["status"]), /sent, with a step pending: 1/);
  for (const status of ["rejected", "not-hired", "work-not-available", "withdrawn", "closed", "hired", "started"]) {
    cli(["outcome", dir, status]);
    assert.doesNotMatch(cli(["status"]), /sent, with a step pending|Pending assessment/);
    const record = JSON.parse(cli(["export", "--format", "json"]))[0];
    assert.equal(record.pending, "Pending assessment");
    assert.equal(record.due, "2099-03-01");
    assert.ok(record.events.some((e: { note?: string }) => e.note?.includes("Pending assessment")));
  }
  cli(["app", "skip", dir, "--reason", "No longer pursuing", "--no-log"]);
  assert.doesNotMatch(cli(["status"]), /sent, with a step pending|Pending assessment/);
}));

test("CLI missing answers leave record, proof, queue and run log untouched; corrected retry records submission once", fixture((fx, cli) => {
  const url = "https://example.com/jobs/1";
  cli(["queue", "add", "--url", url, "--company", "Example Works", "--role", "Analyst"]);
  const dir = cli(["app", "new", "--company", "Example Works", "--role", "Analyst", "--url", url]).trim();
  const recordPath = join(fx.root, dir, "record.md");
  const queuePath = join(fx.root, "people/pat-lee/queue.md");
  const proof = fx.write("input-proof.txt", "Fictional receipt confirmation");
  const recordBefore = readFileSync(recordPath, "utf8");
  const queueBefore = readFileSync(queuePath, "utf8");
  const args = ["app", "submit", dir, "--on", "2025-03-04", "--confirmation", "Receipt", "--proof", proof, "--answers", join(fx.root, "missing-answers.txt")];
  cli(args, 1);
  assert.equal(readFileSync(recordPath, "utf8"), recordBefore);
  assert.equal(readFileSync(queuePath, "utf8"), queueBefore);
  assert.equal(existsSync(join(fx.root, dir, "confirmation.txt")), false);
  assert.equal(existsSync(join(fx.root, "people/pat-lee/runs")), false);

  const answers = fx.write("missing-answers.txt", "Experience: confirmed — source: profile\n");
  assert.equal(answers, args.at(-1));
  cli(args);
  const record = JSON.parse(cli(["export", "--format", "json"]))[0];
  assert.equal(record.status, "submitted");
  assert.equal(record.applied, "2025-03-04");
  assert.equal(record.events.filter((e: { kind: string }) => e.kind === "submitted").length, 1);
  assert.match(readFileSync(recordPath, "utf8"), /Experience: confirmed/);
  assert.equal(readFileSync(join(fx.root, dir, "confirmation.txt"), "utf8"), "Fictional receipt confirmation");
  assert.match(readFileSync(queuePath, "utf8"), /status: done/);
  assert.match(readFileSync(queuePath, "utf8"), /outcome: submitted/);
  assert.equal(existsSync(join(fx.root, "people/pat-lee/runs")), true);
  const after = readFileSync(recordPath, "utf8");
  cli(args, 1);
  assert.equal(readFileSync(recordPath, "utf8"), after, "successful submission cannot be silently re-dated or duplicated");
}));
