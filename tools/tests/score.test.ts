import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import scoreCommand from "../src/commands/score.ts";
import { readDoc, writeDoc } from "../src/lib/frontmatter.ts";
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
  "score computes a weighted 0-100 from a fit: map and writes it back to the record",
  withFixture({}, async (fx) => {
    await appCommand.run(["new", "--company", "Acme", "--role", "Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    const recordPath = `${appDir}/record.md`;
    const { data, body } = readDoc(recordPath);
    (data as Record<string, unknown>).fit = {
      must_haves_met: 2, must_haves_total: 2, pay_ok: true, arrangement_ok: true, location_ok: true,
      seniority: "match", preferred_met: 1, preferred_total: 2,
    };
    writeDoc(recordPath, data, body);

    const code = await scoreCommand.run([appDir, "--person", "pat-lee"]);
    assert.equal(code, 0);
    const after = readDoc(recordPath);
    // 35 + 10 + 10 + 10 + 20 + 15*(1/2) = 92.5 -> rounds to 93
    assert.equal(after.data.score, 93);
  }),
);

test(
  "score reports missing fit: map and --all skips it without failing",
  withFixture({}, async (fx) => {
    await appCommand.run(["new", "--company", "Acme", "--role", "Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    assert.equal(await scoreCommand.run([appDir, "--person", "pat-lee"]), 1);
    assert.equal(await scoreCommand.run(["--all", "--person", "pat-lee"]), 0);
  }),
);
