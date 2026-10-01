import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/followups.ts";
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
  "followups lists only submitted applications whose follow_up date has passed",
  withFixture(
    {
      "people/pat-lee/applications/2020-01-01_a_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "A"\nrole: "Role"\nstatus: submitted\napplied: "2020-01-01"\nfollow_up: "2020-01-08"\nupdated: "2020-01-01"\n---\n',
      "people/pat-lee/applications/2099-01-01_b_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "B"\nrole: "Role"\nstatus: submitted\napplied: "2099-01-01"\nfollow_up: "2099-01-08"\nupdated: "2099-01-01"\n---\n',
    },
    async () => {
      const { code, lines } = await captureLog(() => command.run(["--person", "pat-lee"]));
      assert.equal(code, 0);
      assert.ok(lines.some((l) => l.includes("A — Role")));
      assert.ok(!lines.some((l) => l.includes("B — Role")));
    },
  ),
);
