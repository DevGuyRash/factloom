import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import command from "../src/commands/app.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { makeFixture } from "./helpers/fixture.ts";

function withFixture(files: Record<string, string>, fn: (fx: ReturnType<typeof makeFixture>) => Promise<void> | void) {
  return async () => {
    const fx = makeFixture(files);
    const prev = process.env.RESUMES_ROOT;
    process.env.RESUMES_ROOT = fx.root;
    try {
      await fn(fx);
    } finally {
      if (prev === undefined) delete process.env.RESUMES_ROOT;
      else process.env.RESUMES_ROOT = prev;
      fx.cleanup();
    }
  };
}

test(
  "app new creates a drafted application and refuses a duplicate",
  withFixture({}, async (fx) => {
    const code = await command.run(["new", "--company", "Acme", "--role", "AI Engineer", "--person", "pat-lee"]);
    assert.equal(code, 0);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const names = readdirSync(dir);
    assert.equal(names.length, 1);
    const { data } = readDoc(`${dir}/${names[0]}/record.md`);
    assert.equal(data.status, "drafted");
    assert.equal(data.company, "Acme");

    const dup = await command.run(["new", "--company", "Acme", "--role", "AI Engineer", "--person", "pat-lee"]);
    assert.equal(dup, 1);
  }),
);

test(
  "app new refuses a blocked employer",
  withFixture(
    { "people/pat-lee/employers.md": "---\ntype: employers\nperson: pat-lee\nitems:\n  - company: Blocked Co\n    blocked: true\n    reason: current employer\n---\n" },
    async () => {
      const code = await command.run(["new", "--company", "Blocked Co", "--role", "Engineer", "--person", "pat-lee"]);
      assert.equal(code, 1);
    },
  ),
);

test(
  "app submit sets submitted, applied, follow_up, and updated",
  withFixture({}, async (fx) => {
    await command.run(["new", "--company", "Acme", "--role", "AI Engineer", "--url", "https://acme.example/job/1", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    const code = await command.run(["submit", appDir, "--confirmation", "CONF123", "--person", "pat-lee"]);
    assert.equal(code, 0);
    const { data } = readDoc(`${appDir}/record.md`);
    assert.equal(data.status, "submitted");
    assert.equal(data.confirmation, "CONF123");
    assert.ok(typeof data.applied === "string");
    assert.ok(typeof data.follow_up === "string");
    assert.ok((data.follow_up as string) > (data.applied as string));
  }),
);

test(
  "app hold sets blocked and appends the reason",
  withFixture({}, async (fx) => {
    await command.run(["new", "--company", "Acme", "--role", "AI Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    const code = await command.run(["hold", appDir, "--reason", "needs a CAPTCHA", "--person", "pat-lee"]);
    assert.equal(code, 0);
    const { data, body } = readDoc(`${appDir}/record.md`);
    assert.equal(data.status, "blocked");
    assert.match(body, /needs a CAPTCHA/);
    // status and the dashboard show the latest hold's reason, not the record's template comment.
    const { pendingSnapshot } = await import("../src/lib/stats.ts");
    await command.run(["hold", appDir, "--reason", "needs the person's sign-in", "--person", "pat-lee"]);
    const held = pendingSnapshot("pat-lee", fx.root).held;
    assert.equal(held.length, 1);
    assert.match(held[0].reason, /^needs the person's sign-in \(since \d{4}-\d{2}-\d{2}\)$/);
  }),
);

test(
  "a skipped posting or a different requisition is no duplicate; a similar title is shown for judgment and --distinct-from records why",
  withFixture({}, async (fx) => {
    const dir = `${fx.root}/people/pat-lee/applications`;
    const lines: string[] = [];
    const err = console.error;
    console.error = (...m: unknown[]) => lines.push(m.join(" "));
    try {
      await command.run(["new", "--company", "Acme", "--role", "Software Engineer", "--requisition", "R100", "--person", "pat-lee"]);
      const first = readdirSync(dir)[0];
      await command.run(["skip", first, "--reason", "on-site only", "--person", "pat-lee"]);
      // Screening one posting out says nothing about another at the same employer.
      assert.equal(await command.run(["new", "--company", "Acme", "--role", "Software Engineer (Remote)", "--person", "pat-lee"]), 0);
      assert.equal(await command.run(["new", "--company", "Acme", "--role", "Senior Software Engineer", "--requisition", "R200", "--person", "pat-lee"]), 0);
      // A similar title at the same employer, with nothing to tell them apart, is shown rather than silently allowed.
      assert.equal(await command.run(["new", "--company", "Acme", "--role", "Software Engineer Remote", "--person", "pat-lee"]), 1);
      assert.match(lines.join("\n"), /possible duplicate of .*Software Engineer \(Remote\); status drafted.*--distinct-from/s);
      const remote = readdirSync(dir).find((n) => n.endsWith("software-engineer-remote"))!;
      assert.equal(await command.run(["new", "--company", "Acme", "--role", "Software Engineer Remote", "--distinct-from", remote, "--because", "the Denver team, not Boston", "--person", "pat-lee"]), 0);
      const second = readdirSync(dir).find((n) => n.endsWith("software-engineer-remote-2"))!;
      assert.match(readDoc(`${dir}/${second}/record.md`).body, /a different job from .*: the Denver team, not Boston/);
      assert.match(readDoc(`${dir}/${remote}/record.md`).body, /is a different job: the Denver team, not Boston/);
      // The same link is the same job, whatever the title.
      await command.run(["new", "--company", "Beta", "--role", "Analyst", "--url", "https://beta.example/jobs/9", "--person", "pat-lee"]);
      assert.equal(await command.run(["new", "--company", "Beta", "--role", "Data Analyst", "--url", "https://beta.example/jobs/9", "--distinct-from", "x", "--because", "y", "--person", "pat-lee"]), 1);
      assert.match(lines.join("\n"), /already applied for: .* has the same link/);
    } finally {
      console.error = err;
    }
  }),
);

test(
  "hold, submit, and skip close the queue item found through the job-board link, and queue next repairs older ones",
  withFixture({}, async (fx) => {
    const queueCmd = (await import("../src/commands/queue.ts")).default;
    const { loadQueue, saveQueue } = await import("../src/lib/queue.ts");
    const board = "https://board.example/view/1";
    await queueCmd.run(["add", "--url", board, "--company", "Acme", "--role", "Analyst", "--person", "pat-lee"]);
    await queueCmd.run(["start", board, "--person", "pat-lee"]);
    await command.run(["new", "--company", "Acme", "--role", "Analyst", "--url", "https://acme.example/careers/1", "--source", board, "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const app = readdirSync(dir)[0];
    await command.run(["hold", app, "--reason", "needs a sign-in", "--person", "pat-lee"]);
    let item = loadQueue("pat-lee").items[0];
    assert.equal(item.status, "done");
    assert.equal(item.outcome, "held");

    // An item left open by an older engine closes the next time the queue is read.
    saveQueue("pat-lee", [{ ...item, status: "queued", outcome: undefined }]);
    await command.run(["reopen", app, "--reason", "the person signed in", "--person", "pat-lee"]);
    await command.run(["submit", app, "--follow-up", "10", "--person", "pat-lee"]);
    item = loadQueue("pat-lee").items[0];
    assert.equal(item.outcome, "submitted");
    saveQueue("pat-lee", [{ ...item, status: "queued", outcome: undefined }]);
    const log = console.log;
    const out: string[] = [];
    console.log = (...m: unknown[]) => out.push(m.join(" "));
    try {
      await queueCmd.run(["next", "--person", "pat-lee"]);
    } finally {
      console.log = log;
    }
    assert.match(out.join("\n"), /closed 1 queue item/);
    assert.match(out.join("\n"), /queue is empty/);
    const { data } = readDoc(`${dir}/${app}/record.md`);
    assert.equal(data.status, "submitted");
    const tenDays = new Date(`${data.applied}T00:00:00`);
    tenDays.setDate(tenDays.getDate() + 10);
    assert.equal(data.follow_up, tenDays.toLocaleDateString("en-CA"));
  }),
);
