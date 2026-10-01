// keywords: compares a posting snapshot against the resume variant used and the person's facts.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { keywordReport } from "../src/commands/keywords.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

function seed(fx: ReturnType<typeof makeFixture>): string {
  fx.write("shared/lexicon.yaml", readFileSync(join(REAL_ROOT, "shared", "lexicon.yaml"), "utf8"));
  fx.write("shared/templates/themes/classic-blue.json", readFileSync(join(REAL_ROOT, "shared", "templates", "themes", "classic-blue.json"), "utf8"));
  fx.write("people/pat-lee/resumes/source/facts.yaml", `
person: pat-lee
name: Pat Lee
contact: [{ text: "Phoenix, AZ" }]
skills:
  data: { label: "Data", items: "SQL, Python" }
  systems: { label: "Systems", items: "Rust" }
projects:
  widgets:
    title: "Widgets"
    bullets:
      - text: "Built a pipeline in Python and SQL."
lines: {}
`);
  fx.write("people/pat-lee/resumes/source/variants/data-analyst.yaml", `
variant: data-analyst
theme: classic-blue
headline: "Data Analyst"
output: Pat_Lee_Resume
sections:
  - title: Technical Skills
    labeled: [data]
  - title: Projects
    entries:
      - project: widgets
`);
  const appDir = "people/pat-lee/applications/2026-10-01_acme_data-analyst";
  fx.write(`${appDir}/record.md`, `---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "Data Analyst"\nstatus: drafted\nupdated: 2026-10-01\nresume: data-analyst\n---\n`);
  fx.write(`${appDir}/posting.md`, `---\ntype: posting\nperson: pat-lee\ncompany: "Acme"\nrole: "Data Analyst"\ncaptured: 2026-10-01\n---\n\n## Description\n\nLooking for Python, Rust, and Go experience.\n`);
  return join(fx.root, appDir);
}

test("keywords reports matched terms, facts-not-resume gaps, and posting gaps with no evidence", () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const { path } = keywordReport(dir, fx.root);
    const { data, body } = readDoc(path);
    assert.strictEqual(data.type, "keyword-report");
    assert.strictEqual(data.person, "pat-lee");
    assert.strictEqual(data.resume, "data-analyst");
    assert.match(body, /Matched terms[\s\S]*- Python/, "Python matched (in posting and resume)");
    assert.match(body, /missing from this resume[\s\S]*- Rust/, "Rust is in facts but not this resume");
    assert.match(body, /honest gaps\)\s*\n\n- Go/, "Go has no evidence anywhere in facts");
  } finally {
    fx.cleanup();
  }
});

test("keywords ranks every variant when the record names no resume, and an explicit variant wins", () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    fx.write("people/pat-lee/resumes/source/variants/systems.yaml", `variant: systems\ntheme: classic-blue\nheadline: "Systems Engineer"\noutput: Pat_Lee_Resume\nsections:\n  - title: Technical Skills\n    labeled: [systems]\n`);
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/record.md", `---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\nstatus: drafted\nupdated: 2026-10-01\n---\n`);
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/posting.md", `---\ntype: posting\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\ncaptured: 2026-10-01\n---\n\nLooking for Rust and Go experience.\n`);
    const ranked = keywordReport(dir, fx.root);
    assert.strictEqual(readDoc(ranked.path).data.resume, "systems", "the best-matching variant is reported");
    assert.deepStrictEqual(ranked.ranking, [{ variant: "systems", matched: 1 }, { variant: "data-analyst", matched: 0 }]);
    assert.match(ranked.body, /Variant ranking[\s\S]*`systems`: 1 matched[\s\S]*`data-analyst`: 0 matched/);
    const chosen = keywordReport(dir, fx.root, "data-analyst");
    assert.strictEqual(readDoc(chosen.path).data.resume, "data-analyst");
    assert.strictEqual(chosen.ranking, undefined);
    assert.doesNotMatch(chosen.body, /Variant ranking/);
  } finally {
    fx.cleanup();
  }
});
