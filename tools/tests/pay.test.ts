import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/pay.ts";
import { aggregatePay } from "../src/lib/stats.ts";
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

const APP_DIR = "people/pat-lee/applications/2026-01-01_acme_engineer";

test(
  "pay normalizes hourly pay to annual (2080h) and aggregates by variant",
  withFixture(
    {
      [`${APP_DIR}/record.md`]: '---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\nstatus: drafted\nresume: ai-engineer\nupdated: "2026-01-01"\n---\n',
      [`${APP_DIR}/posting.md`]: '---\ntype: posting\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\npay_min: 50\npay_max: 60\npay_period: hour\n---\n',
    },
    async (fx) => {
      const rows = aggregatePay("pat-lee", "variant", fx.root);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].key, "ai-engineer");
      assert.equal(rows[0].min, 50 * 2080);
      assert.equal(rows[0].max, 60 * 2080);

      assert.equal(await command.run(["--by", "variant", "--person", "pat-lee"]), 0);
      assert.throws(() => command.run(["--by", "bogus", "--person", "pat-lee"]), /--by must be/);
    },
  ),
);
