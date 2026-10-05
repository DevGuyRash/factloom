// The resume floor: what any reader or parser trips on, reported and never rewritten.
import assert from "node:assert";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFitted } from "../src/render/fit.ts";
import { belowFloor, extractionGaps } from "../src/render/floor.ts";
import { loadTheme } from "../src/render/theme.ts";
import { REAL_ROOT } from "./helpers/fixture.ts";
import { resolveContent, type Facts, type Variant } from "../src/render/spec.ts";

const FLOOR = { bullets_per_entry: 1, bullets_total: 4, bullet_words_min: 4, bullet_words_max: 45 };

const facts: Facts = {
  person: "pat-lee", name: "Pat Lee", contact: [{ text: "pat@example.com" }], lines: {},
  skills: { core: { label: "Core", items: "SQL, Python" } },
  projects: {},
  jobs: {
    acme: { title: "Analyst, Acme", dates: "2022 – 2025", bullets: [
      { text: "Cut the monthly close from ten days to six by automating reconciliations." },
      { text: "Built the dashboards finance uses to forecast cash." },
      { text: "Trained four analysts on SQL and the reporting stack." },
      { text: "Wrote the runbook for quarter-end reporting." },
    ] },
    beta: { title: "Clerk, Beta", bullets: [{ text: "Filing." }] },
  },
};

test("a resume with substance clears the floor", () => {
  const variant: Variant = { variant: "v", theme: "t", headline: "Financial analyst", output: "o", sections: [{ title: "Experience", entries: [{ job: "acme" }] }, { title: "Skills", labeled: ["core"] }] };
  assert.deepStrictEqual(belowFloor(resolveContent(facts, variant), facts, variant, FLOOR), []);
});

test("the floor names thin entries, fragments, missing dates, repeats, empty sections, and placeholders", () => {
  const variant: Variant = { variant: "v", theme: "t", headline: "", output: "o", sections: [
    { title: "Experience", entries: [{ job: "beta" }, { job: "acme", bullets: [0, 0] }] },
    { title: "Summary", paragraph: "TODO" },
  ] };
  const lines = belowFloor(resolveContent(facts, variant), facts, variant, FLOOR);
  for (const want of [/no headline/, /job "Clerk, Beta" has no dates/, /3 bullets in all, fewer than 4/, /a 1-word bullet: "Filing\."/, /appears twice/, /placeholder text: "TODO"/]) {
    assert.ok(lines.some((l) => want.test(l)), `${want} in ${JSON.stringify(lines)}`);
  }
});

test("the built file's text must give back the name, the email, and every bullet in order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "floor-"));
  try {
    const variant: Variant = { variant: "v", theme: "classic-blue", headline: "Financial analyst", output: "Pat_Lee_Resume", sections: [{ title: "Experience", entries: [{ job: "acme" }] }] };
    const content = resolveContent(facts, variant);
    const { files } = await writeFitted(loadTheme("classic-blue", REAL_ROOT), content, dir, variant.output);
    assert.deepEqual(await extractionGaps(content, files), [], "what was written reads back");
    // A bullet the file does not hold, as when a font loses digits, is named.
    const garbled = resolveContent(facts, variant);
    garbled.sections[0].entries![0].bullets![0] = "Cut the monthly close from 10 days to 6 by automating reconciliations.";
    assert.match((await extractionGaps(garbled, files)).join("\n"), /lacks or garbles: "Cut the monthly close from 10 days/);
    const reordered = resolveContent(facts, variant);
    reordered.sections[0].entries![0].bullets!.reverse();
    assert.match((await extractionGaps(reordered, files)).join("\n"), /"Analyst, Acme" bullets out of order/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
