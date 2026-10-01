import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/export.ts";
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

async function captureLog(fn: () => Promise<number> | number): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const code = await fn();
    return { code, lines };
  } finally {
    console.log = orig;
  }
}

test(
  "export emits a CSV header and one row per application, and valid JSON",
  withFixture(
    {
      "people/pat-lee/applications/2026-01-01_a_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "A Co"\nrole: "Role"\nstatus: drafted\nupdated: "2026-01-01"\n---\n',
    },
    async () => {
      const csv = await captureLog(() => command.run(["--format", "csv", "--person", "pat-lee"]));
      assert.equal(csv.code, 0);
      assert.match(csv.lines[0], /^company,role,status/);
      assert.ok(csv.lines[1].includes("A Co"));

      const json = await captureLog(() => command.run(["--format", "json", "--person", "pat-lee"]));
      assert.equal(json.code, 0);
      const parsed = JSON.parse(json.lines[0]);
      assert.equal(parsed[0].company, "A Co");
    },
  ),
);
