import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import command from "../src/commands/proof.ts";
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
  "proof copies the confirmation file into the application directory and records it",
  withFixture({}, async (fx) => {
    await appCommand.run(["new", "--company", "Acme", "--role", "Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    const proofFile = join(fx.root, "confirmation-source.txt");
    writeFileSync(proofFile, "Confirmation #12345");

    const code = await command.run([appDir, proofFile, "--person", "pat-lee"]);
    assert.equal(code, 0);
    const { data } = readDoc(`${appDir}/record.md`);
    assert.equal(data.confirmation, "confirmation.txt");
    assert.ok(readdirSync(appDir).includes("confirmation.txt"));
  }),
);

test(
  "proof keeps a confirmation number recorded at submit and records the file beside it",
  withFixture({}, async (fx) => {
    await appCommand.run(["new", "--company", "Acme", "--role", "Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    await appCommand.run(["submit", appDir, "--confirmation", "Application #A-778", "--person", "pat-lee"]);
    const shot = join(fx.root, "page.png");
    writeFileSync(shot, "png");
    assert.equal(await command.run([appDir, shot, "--person", "pat-lee"]), 0);
    const { data } = readDoc(`${appDir}/record.md`);
    assert.equal(data.confirmation, "Application #A-778");
    assert.equal(data.proof, "confirmation.png");
  }),
);
