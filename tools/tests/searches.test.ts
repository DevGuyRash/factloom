import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/searches.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { today } from "../src/lib/repo.ts";
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

const SEARCHES =
  "---\ntype: searches\nperson: pat-lee\nitems:\n" +
  "  - id: a\n    variant: a\n    site: hiring.cafe\n    url: https://hiringcafe.com/\n    every_days: 3\n    last_run: null\n" +
  `  - id: b\n    variant: b\n    site: hiring.cafe\n    url: https://hiringcafe.com/\n    every_days: 3\n    last_run: "${today()}"\n` +
  "---\n";

async function captureLog(fn: () => unknown): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

test(
  "searches due excludes a search run today; mark records the date and time it ran",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async (fx) => {
    const due = await captureLog(() => command.run(["due", "--person", "pat-lee"]));
    assert.deepEqual(due.map((l) => l.split(" ")[0]), ["a"]);

    const mark = await command.run(["mark", "a", "--person", "pat-lee"]);
    assert.equal(mark, 0);
    const { data } = readDoc(`${fx.root}/people/pat-lee/searches.md`);
    const items = data.items as { id: string; last_run: string }[];
    const stamp = items.find((i) => i.id === "a")!.last_run;
    assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.equal(stamp.slice(0, 10), today());
    // A search run earlier today, recorded with its time, is no more due than one recorded by date alone.
    assert.deepEqual(await captureLog(() => command.run(["due", "--person", "pat-lee"])), ["no searches due"]);
  }),
);

test(
  "searches next rotates through every search, run longest ago first, whatever is due",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async () => {
    const first = (lines: string[]) => lines[0].split(" ")[0];
    // a has never run; b ran today but still comes up once a has had its turn.
    assert.equal(first(await captureLog(() => command.run(["next", "--person", "pat-lee"]))), "a");
    await command.run(["mark", "a", "--person", "pat-lee"]);
    const next = await captureLog(() => command.run(["next", "--person", "pat-lee"]));
    assert.equal(first(next), "b");
    assert.ok(next.includes("  url: https://hiringcafe.com/"), next.join("\n"));
    await command.run(["mark", "b", "--person", "pat-lee"]);
    // Both now ran today; a ran first (or in the same minute, and comes first in the file).
    assert.equal(first(await captureLog(() => command.run(["next", "--person", "pat-lee"]))), "a");
  }),
);

test(
  "searches next alternates sites among searches that ran equally long ago, and leaves out skipped sites",
  withFixture(
    {
      "people/pat-lee/searches.md":
        "---\ntype: searches\nperson: pat-lee\nitems:\n" +
        ["a1:a.example", "a2:a.example", "a3:a.example", "b1:b.example"]
          .map((x) => x.split(":"))
          .map(([id, site]) => `  - id: ${id}\n    site: ${site}\n    url: https://${site}/${id}\n    every_days: 1\n    last_run: null\n`)
          .join("") +
        "---\n",
    },
    async () => {
      const next = async (...extra: string[]) => (await captureLog(() => command.run(["next", ...extra, "--person", "pat-lee"])))[0].split(" ")[0];
      const order: string[] = [];
      for (let i = 0; i < 4; i++) {
        const id = await next();
        order.push(id);
        await command.run(["mark", id, "--person", "pat-lee"]);
      }
      // b1 comes between a.example's searches, and runs once in the pass.
      assert.deepEqual(order, ["a1", "b1", "a2", "a3"]);
      assert.equal(await next("--skip-sites", "a.example"), "b1");
      assert.equal(await next("--skip-sites", "A.example,b.example"), "every");
    },
  ),
);

test(
  "searches next without saved searches says how to add them",
  withFixture({ "people/pat-lee/profile.md": "---\ntype: profile\nperson: pat-lee\n---\n" }, async () => {
    const lines = await captureLog(() => command.run(["next", "--person", "pat-lee"]));
    assert.match(lines.join("\n"), /^no saved searches/);
  }),
);

test(
  "searches add saves a search for an active resume, refusing a taken id, a search already saved, and an unknown resume",
  withFixture(
    { "people/pat-lee/searches.md": SEARCHES, "people/pat-lee/resumes/active/a/guide.md": "---\ntype: resume-guide\n---\n" },
    async (fx) => {
      const added = await captureLog(() =>
        command.run(["add", "a-analyst-remote", "--url", "https://example.com/jobs?q=analyst&sort=date", "--variant", "a", "--site", "example.com", "--query", "analyst", "--person", "pat-lee"]),
      );
      assert.match(added[0], /^added a-analyst-remote/);
      const { data } = readDoc(`${fx.root}/people/pat-lee/searches.md`);
      const item = (data.items as Record<string, unknown>[]).find((i) => i.id === "a-analyst-remote");
      assert.deepEqual(item, { id: "a-analyst-remote", variant: "a", site: "example.com", url: "https://example.com/jobs?q=analyst&sort=date", query: "analyst", every_days: 1, last_run: null });

      const add = (...extra: string[]) => command.run(["add", ...extra, "--person", "pat-lee"]);
      assert.throws(() => add("a", "--url", "https://example.com/other"), /exists already/);
      assert.throws(() => add("dup", "--url", "https://example.com/jobs?q=analyst&sort=date", "--query", "Analyst"), /already runs/);
      // Sites that keep the query out of the URL share one URL across searches.
      assert.equal(add("same-url-other-query", "--url", "https://hiringcafe.com/", "--query", "operations analyst"), 0);
      assert.throws(() => add("c", "--url", "https://example.com/c", "--variant", "missing"), /no active resume missing \(active: a\)/);
      assert.throws(() => add("d", "--url", "https://example.com/d", "--every-days", "0"), /whole number/);
      assert.throws(() => add("Bad Id", "--url", "https://example.com/e"), /lowercase/);
      assert.equal((readDoc(`${fx.root}/people/pat-lee/searches.md`).data.items as unknown[]).length, 4);
    },
  ),
);

test(
  "searches list runs without error",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async () => {
    assert.equal(await command.run(["list", "--person", "pat-lee"]), 0);
  }),
);
