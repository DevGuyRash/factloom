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

test(
  "searches due excludes a search run today; mark updates last_run to today",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async (fx) => {
    const code = await command.run(["due", "--person", "pat-lee"]);
    assert.equal(code, 0);

    const mark = await command.run(["mark", "a", "--person", "pat-lee"]);
    assert.equal(mark, 0);
    const { data } = readDoc(`${fx.root}/people/pat-lee/searches.md`);
    const items = data.items as { id: string; last_run: string }[];
    assert.equal(items.find((i) => i.id === "a")!.last_run, today());
  }),
);

test(
  "searches list runs without error",
  withFixture({ "people/pat-lee/searches.md": SEARCHES }, async () => {
    assert.equal(await command.run(["list", "--person", "pat-lee"]), 0);
  }),
);
