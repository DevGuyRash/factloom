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

test(
  "a skip keeps the answer that ruled it out; queue list, onboarding answer, and stats find it again",
  withFixture({ "shared/onboarding.md": "---\ntype: onboarding-catalog\n---\n\n# Onboarding catalog\n\n## Location\n\n### prefs.travel (essential)\n- Ask: Travel?\n- Shape: the most\n- Policy: auto\n" }, async (fx) => {
    const out: string[] = [];
    const log = console.log;
    console.log = (...m: unknown[]) => out.push(m.join(" "));
    try {
      assert.equal(await command.run(["skip", "--url", "https://x.example/job/7", "--company", "Acme", "--role", "Analyst", "--reason", "travel 25%", "--rule", "prefs.travel", "--person", "pat-lee"]), 0);
      fx.write("skips.tsv", "https://x.example/job/8\tBeta\tEngineer\tpays below the minimum\tcomp.minimum\nhttps://x.example/job/9\tGamma\tEngineer\tnot the focus\n");
      assert.equal(await command.run(["skip", "--from", `${fx.root}/skips.tsv`, "--person", "pat-lee"]), 0);
      const { data } = readDoc(`${fx.root}/people/pat-lee/queue.md`);
      const rules = (data.items as { url: string; rule?: string; note?: string }[]).map((i) => [i.url.slice(-1), i.rule ?? "-", i.note]);
      assert.deepEqual(rules, [["7", "prefs.travel", "travel 25%"], ["8", "comp.minimum", "pays below the minimum"], ["9", "-", "not the focus"]]);

      out.length = 0;
      assert.equal(await command.run(["list", "--rule", "prefs.travel", "--person", "pat-lee"]), 0);
      assert.match(out.join("\n"), /1 skipped under prefs\.travel[\s\S]*job\/7/);

      out.length = 0;
      const onboarding = (await import("../src/commands/onboarding.ts")).default;
      assert.equal(await onboarding.run(["answer", "prefs.travel", "Up to 10%", "--person", "pat-lee"]), 0);
      assert.match(out.join("\n"), /1 posting\(s\) were skipped under prefs\.travel[\s\S]*queue list --rule prefs\.travel/);

      out.length = 0;
      const stats = (await import("../src/commands/stats.ts")).default;
      assert.equal(await stats.run(["--person", "pat-lee"]), 0);
      assert.match(out.join("\n"), /skipped, by the answer that ruled them out[\s\S]*prefs\.travel\s+1[\s\S]*\(no rule recorded\)\s+1/);

      // The changed answer lets it back in.
      assert.equal(await command.run(["reopen", "https://x.example/job/7", "--note", "travel now up to 10%", "--person", "pat-lee"]), 0);
      const reopened = (readDoc(`${fx.root}/people/pat-lee/queue.md`).data.items as Record<string, unknown>[])[0];
      assert.equal(reopened.status, "queued");
      assert.ok(!("rule" in reopened) && !("outcome" in reopened), JSON.stringify(reopened));
    } finally {
      console.log = log;
    }
  }),
);
