import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/employers.ts";
import { findEmployer } from "../src/lib/employers.ts";
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
  "employers block and priority upsert by normalized company name",
  withFixture({}, async (fx) => {
    assert.equal(await command.run(["block", "Acme, Inc.", "--reason", "bad experience", "--person", "pat-lee"]), 0);
    assert.equal(await command.run(["priority", "Beta LLC", "--person", "pat-lee"]), 0);

    const acme = findEmployer("pat-lee", "ACME", fx.root);
    assert.equal(acme?.blocked, true);
    assert.equal(acme?.reason, "bad experience");

    const beta = findEmployer("pat-lee", "Beta", fx.root);
    assert.equal(beta?.priority, true);

    assert.equal(await command.run(["check", "Acme", "--person", "pat-lee"]), 0);
    assert.equal(await command.run(["list", "--person", "pat-lee"]), 0);
  }),
);
