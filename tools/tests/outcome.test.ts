import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import command from "../src/commands/outcome.ts";
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
  "outcome updates status + updated and appends a dated history line; rejects an unknown status",
  withFixture({}, async (fx) => {
    await appCommand.run(["new", "--company", "Acme", "--role", "Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;

    const code = await command.run([appDir, "interviewing", "--note", "phone screen Tuesday", "--person", "pat-lee"]);
    assert.equal(code, 0);
    const { data, body } = readDoc(`${appDir}/record.md`);
    assert.equal(data.status, "interviewing");
    assert.match(body, /phone screen Tuesday/);

    assert.throws(() => command.run([appDir, "not-a-status", "--person", "pat-lee"]), /status must be one of/);
  }),
);
