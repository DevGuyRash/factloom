// The resume floor: what any reader or parser trips on, reported and never rewritten.
import assert from "node:assert";
import test from "node:test";
import { belowFloor } from "../src/render/floor.ts";
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
