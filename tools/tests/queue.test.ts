import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/queue.ts";
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
  "queue add refuses a blocked employer; start/done update the matched item",
  withFixture({ "people/pat-lee/employers.md": "---\ntype: employers\nperson: pat-lee\nitems:\n  - company: Blocked Co\n    blocked: true\n---\n" }, async (fx) => {
    const blocked = await command.run(["add", "--url", "https://x.example/job/1", "--company", "Blocked Co", "--person", "pat-lee"]);
    assert.equal(blocked, 1);

    const added = await command.run(["add", "--url", "https://x.example/job/2", "--company", "Acme", "--role", "Engineer", "--score", "80", "--person", "pat-lee"]);
    assert.equal(added, 0);

    const queuePath = `${fx.root}/people/pat-lee/queue.md`;
    const { data: afterAdd } = readDoc(queuePath);
    assert.equal((afterAdd.items as unknown[]).length, 1);

    const start = await command.run(["start", "https://x.example/job/2", "--person", "pat-lee"]);
    assert.equal(start, 0);
    const { data: afterStart } = readDoc(queuePath);
    assert.equal((afterStart.items as { status: string }[])[0].status, "in-progress");

    const done = await command.run(["done", "https://x.example/job/2", "--outcome", "submitted", "--person", "pat-lee"]);
    assert.equal(done, 0);
    const { data: afterDone } = readDoc(queuePath);
    assert.equal((afterDone.items as { status: string; outcome: string }[])[0].outcome, "submitted");
  }),
);

test(
  "queue drop marks the matching item done with outcome dropped",
  withFixture(
    { "people/pat-lee/queue.md": '---\ntype: queue\nperson: pat-lee\nitems:\n  - url: https://x.example/job/3\n    found: "2026-01-01"\n    status: queued\n---\n' },
    async (fx) => {
      const code = await command.run(["drop", "https://x.example/job/3", "--note", "not a fit", "--person", "pat-lee"]);
      assert.equal(code, 0);
      const { data } = readDoc(`${fx.root}/people/pat-lee/queue.md`);
      const item = (data.items as { status: string; outcome: string; note: string }[])[0];
      assert.equal(item.status, "done");
      assert.equal(item.outcome, "dropped");
      assert.equal(item.note, "not a fit");
    },
  ),
);

test(
  "queue list and next run without error against a stale item",
  withFixture(
    { "people/pat-lee/queue.md": '---\ntype: queue\nperson: pat-lee\nitems:\n  - url: https://x.example/old\n    found: "2000-01-01"\n    status: queued\n---\n' },
    async () => {
      assert.equal(await command.run(["list", "--person", "pat-lee"]), 0);
      assert.equal(await command.run(["next", "--person", "pat-lee"]), 0);
    },
  ),
);
