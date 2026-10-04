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

/** The ids `searches next` suggests, in order. */
async function suggested(...extra: string[]): Promise<string[]> {
  const lines = await captureLog(() => command.run(["next", ...extra, "--person", "pat-lee"]));
  const at = lines.findIndex((l) => l.startsWith("suggested next"));
  return at < 0 ? [] : lines.slice(at + 1).filter((l) => !l.startsWith("  ")).map((l) => l.split(" ")[0]);
}

test(
  "searches due excludes a search run today; mark records the date, time, and offset, and what the run found",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async (fx) => {
    const due = await captureLog(() => command.run(["due", "--person", "pat-lee"]));
    assert.deepEqual(due.map((l) => l.split(" ")[0]), ["a"]);

    const mark = await captureLog(() => command.run(["mark", "a", "--found", "12", "--new", "3", "--person", "pat-lee"]));
    assert.match(mark[0], /^marked a run at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    const { data } = readDoc(`${fx.root}/people/pat-lee/searches.md`);
    const a = (data.items as Record<string, unknown>[]).find((i) => i.id === "a")!;
    assert.equal(String(a.last_run).slice(0, 10), today());
    assert.deepEqual([a.last_found, a.last_new, a.runs, a.new_total], [12, 3, 1, 3]);
    // A search run earlier today, whatever form its stamp takes, is no more due than one recorded by date alone.
    assert.deepEqual(await captureLog(() => command.run(["due", "--person", "pat-lee"])), ["no searches due"]);
  }),
);

test(
  "searches next suggests every search in turn, run longest ago first; the run that completes a pass reports it",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async () => {
    // a has never run; b ran today but still comes up once a has had its turn.
    assert.deepEqual(await suggested("--count", "5"), ["a", "b"]);
    const first = await captureLog(() => command.run(["mark", "a", "--new", "2", "--person", "pat-lee"]));
    assert.match(first.join("\n"), /pass since .*: 1 of 2 open searches run, 2 new posting\(s\) so far/);
    assert.deepEqual(await suggested(), ["b"]);
    const done = await captureLog(() => command.run(["mark", "b", "--new", "0", "--person", "pat-lee"]));
    assert.match(done.join("\n"), /pass complete: 2 open searches run since .*, 2 new posting\(s\)$/);
    const state = await captureLog(() => command.run(["next", "--person", "pat-lee"]));
    assert.match(state.join("\n"), /no pass going[\s\S]*last pass: .* 2 searches, 2 new posting\(s\)/);
    // The next pass starts with the next run, and a pass that finds nothing says so.
    await command.run(["mark", "a", "--new", "0", "--person", "pat-lee"]);
    const empty = await captureLog(() => command.run(["mark", "b", "--new", "0", "--person", "pat-lee"]));
    assert.match(empty.join("\n"), /pass complete: .* 0 new posting\(s\) \(nothing new/);
  }),
);

test(
  "the rotation alternates sites; paused searches and closed sites stay out of it and out of the pass until they return",
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
      // b1 comes between a.example's searches, and comes once.
      assert.deepEqual(await suggested("--count", "4"), ["a1", "b1", "a2", "a3"]);
      await command.run(["close-site", "a.example", "--reason", "rate limit", "--person", "pat-lee"]);
      assert.deepEqual(await suggested("--count", "4"), ["b1"]);
      const marked = await captureLog(() => command.run(["mark", "b1", "--new", "1", "--person", "pat-lee"]));
      // With a.example closed, b1 is every open search, so its run completes the pass.
      assert.match(marked.join("\n"), /pass complete: 1 open searches run/);
      await command.run(["pause", "b1", "--reason", "nothing new in a week", "--person", "pat-lee"]);
      const none = await captureLog(() => command.run(["next", "--person", "pat-lee"]));
      assert.match(none.join("\n"), /closed: a\.example until .* \(rate limit\)[\s\S]*paused: b1 until .*nothing new in a week[\s\S]*every saved search is paused or on a closed site/);
      await command.run(["close-site", "a.example", "--clear", "--person", "pat-lee"]);
      await command.run(["pause", "b1", "--clear", "--person", "pat-lee"]);
      assert.deepEqual(await suggested("--count", "4"), ["a1", "a2", "a3", "b1"]);
      assert.equal(await command.run(["remove", "a3", "--person", "pat-lee"]), 0);
      assert.deepEqual(await suggested("--count", "4"), ["a1", "a2", "b1"]);
      assert.throws(() => command.run(["close-site", "a.example", "--until", "soon", "--person", "pat-lee"]), /--until takes/);
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
