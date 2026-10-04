import assert from "node:assert/strict";
import { readdirSync, utimesSync } from "node:fs";
import test from "node:test";
import command from "../src/commands/run.ts";
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
  "run start/log/end tracks counts in the run log and closes it",
  withFixture({}, async (fx) => {
    const startCode = await command.run(["start", "--person", "pat-lee"]);
    assert.equal(startCode, 0);
    const runsDir = `${fx.root}/people/pat-lee/runs`;
    const file = readdirSync(runsDir)[0];
    const path = `${runsDir}/${file}`;

    assert.equal(await command.run(["log", "--kind", "applied", "submitted to Acme", "--person", "pat-lee"]), 0);
    assert.equal(await command.run(["log", "--kind", "held", "needs CAPTCHA", "--person", "pat-lee"]), 0);

    const mid = readDoc<{ counts: { submitted: number; held: number }; status: string }>(path);
    assert.equal(mid.data.counts.submitted, 1);
    assert.equal(mid.data.counts.held, 1);
    assert.match(mid.body, /submitted to Acme/);

    const endCode = await command.run(["end", "--person", "pat-lee"]);
    assert.equal(endCode, 0);
    const after = readDoc<{ status: string; ended?: string }>(path);
    assert.equal(after.data.status, "finished");
    assert.ok(typeof after.data.ended === "string");
  }),
);

test(
  "run start refuses while another run is at work, takes over on request, and closes a run abandoned without run end",
  withFixture({}, async (fx) => {
    const runsDir = `${fx.root}/people/pat-lee/runs`;
    const err = console.error;
    const errors: string[] = [];
    console.error = (...m: unknown[]) => errors.push(m.join(" "));
    try {
      assert.equal(await command.run(["start", "--person", "pat-lee"]), 0);
      assert.equal(await command.run(["start", "--person", "pat-lee"]), 1);
      assert.match(errors.join("\n"), /another run is at work/);
      assert.equal(await command.run(["start", "--takeover", "--person", "pat-lee"]), 0);
      // A run quiet for an hour has stopped: the next start closes it without --takeover.
      const files = readdirSync(runsDir).sort();
      const newest = `${runsDir}/${files[files.length - 1]}`;
      const hourAgo = new Date(Date.now() - 3600000);
      utimesSync(newest, hourAgo, hourAgo);
      assert.equal(await command.run(["start", "--person", "pat-lee"]), 0);
    } finally {
      console.error = err;
    }
    const logs = readdirSync(runsDir).sort().map((f) => readDoc<{ status: string }>(`${runsDir}/${f}`));
    assert.deepEqual(logs.map((l) => l.data.status), ["finished", "finished", "running"]);
    assert.match(logs[1].body, /closed when the next run started/);
  }),
);
