import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import command from "../src/commands/dashboard.ts";
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
  "dashboard writes people/<person>/dashboard.md with status counts computed from records",
  withFixture(
    {
      "people/pat-lee/applications/2026-01-01_acme_engineer/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\nstatus: submitted\napplied: "2026-01-01"\nupdated: "2026-01-01"\n---\n',
    },
    async (fx) => {
      const code = await command.run(["--person", "pat-lee"]);
      assert.equal(code, 0);
      const out = `${fx.root}/people/pat-lee/dashboard.md`;
      assert.ok(existsSync(out));
      const text = readFileSync(out, "utf8");
      assert.match(text, /type: dashboard/);
      assert.match(text, /\| submitted \| 1 \|/);
    },
  ),
);
