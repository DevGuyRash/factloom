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
