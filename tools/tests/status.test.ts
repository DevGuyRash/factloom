import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/status.ts";
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
  "status reports held applications with their reasons",
  withFixture(
    {
      "people/pat-lee/applications/2026-01-01_a_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "A"\nrole: "Role"\nstatus: blocked\nupdated: "2026-01-01"\n---\n\nWaiting on a CAPTCHA.\n',
    },
    async () => {
      const { code, lines } = await captureLog(() => command.run(["--person", "pat-lee"]));
      assert.equal(code, 0);
      assert.ok(lines.some((l) => l.includes("Waiting on a CAPTCHA")));
      assert.ok(lines.some((l) => l.includes("held: 1")));
    },
  ),
);
