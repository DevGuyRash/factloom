// keywords: compares a posting snapshot against the resume variant used and the person's facts.
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import YAML from "yaml";
import { render } from "../src/render/docx.ts";
import { loadTheme } from "../src/render/theme.ts";
import { loadFacts, loadVariant, resolveContent, factsText } from "../src/render/spec.ts";
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

test("keywords reports matched terms, facts-not-resume gaps, and posting gaps with no evidence", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const { path } = await keywordReport(dir, fx.root);
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

test("keywords ranks every variant when the record names no resume, and an explicit variant wins", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    fx.write("people/pat-lee/resumes/source/variants/systems.yaml", `variant: systems\ntheme: classic-blue\nheadline: "Systems Engineer"\noutput: Pat_Lee_Resume\nsections:\n  - title: Technical Skills\n    labeled: [systems]\n`);
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/record.md", `---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\nstatus: drafted\nupdated: 2026-10-01\n---\n`);
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/posting.md", `---\ntype: posting\nperson: pat-lee\ncompany: "Acme"\nrole: "Engineer"\ncaptured: 2026-10-01\n---\n\nLooking for Rust and Go experience.\n`);
    const ranked = await keywordReport(dir, fx.root);
    assert.strictEqual(readDoc(ranked.path).data.resume, "systems", "the best-matching variant is reported");
    assert.deepStrictEqual(ranked.ranking, [{ variant: "systems", matched: 1 }, { variant: "data-analyst", matched: 0 }]);
    assert.match(ranked.body, /Variant ranking[\s\S]*`systems`: 1 matched[\s\S]*`data-analyst`: 0 matched/);
    const chosen = await keywordReport(dir, fx.root, "data-analyst");
    assert.strictEqual(readDoc(chosen.path).data.resume, "data-analyst");
    assert.strictEqual(chosen.ranking, undefined);
    assert.doesNotMatch(chosen.body, /Variant ranking/);
  } finally {
    fx.cleanup();
  }
});


test("a successful final render exposes a relevant omitted fact without rejecting unrelated omissions", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const source = "people/pat-lee/resumes/source/facts.yaml";
    fx.write(source, readFileSync(join(fx.root, source), "utf8").replace("lines: {}", `jobs:
  service:
    title: Service assistant
    bullets:
      - text: Built Rust scheduling tools for the support team.
        sources: [evidence.md#scheduling]
      - text: Coordinated the staff picnic.
lines: {}`));
    const variant = loadVariant("pat-lee", "data-analyst", fx.root);
    const artifact = join(dir, "final.docx");
    await render(loadTheme("classic-blue", fx.root), resolveContent(loadFacts("pat-lee", fx.root), variant), artifact);
    const report = await keywordReport(dir, fx.root, undefined, { artifact });
    assert.ok(report.coverage.some(x => x.id === "jobs.service.bullets.0" && x.state === "confirmed" && !x.present && x.relevant));
    assert.ok(!report.coverage.find(x => x.id === "jobs.service.bullets.1")?.relevant);
    assert.match(report.body, /evidence.md#scheduling/);
    const omitted = await keywordReport(dir, fx.root, undefined, { artifact, omissions: { "jobs.service.bullets.0": "Outside this role's required scope" } });
    assert.match(omitted.body, /Deliberate omission[\s\S]*Outside this role/);
  } finally { fx.cleanup(); }
});

test("a held keyword stays unconfirmed while its later original confirmation reference is surfaced", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const source = "people/pat-lee/resumes/source/facts.yaml";
    fx.write(source, readFileSync(join(fx.root, source), "utf8").replace("lines: {}", `jobs:
  service:
    title: Service assistant
    bullets:
      - text: Implemented an internal service in Go.
        confirm: [Needs confirmation]
        sources: [evidence.md#earlier-note]
        confirmed_by: [evidence.md#later-confirmation]
lines: {}`));
    fx.write("people/pat-lee/evidence.md", "# Earlier note\nGo duties unknown.\n# Later confirmation\nThe person explicitly confirmed building the internal Go service on 2026-10-12.\n");
    const facts = loadFacts("pat-lee", fx.root);
    assert.doesNotMatch(factsText(facts), /Implemented an internal service in Go/);
    const report = await keywordReport(dir, fx.root);
    assert.ok(report.unconfirmed.includes("go"));
    assert.ok(!report.confirmedMissing.includes("go"));
    assert.match(report.body, /later-confirmation/);
    assert.match(report.body, /explicitly confirmed building/);
    assert.match(report.body, /held flags remain held/i);
  } finally { fx.cleanup(); }
});

test("keyword comparison uses final tailored bytes and produces a real before-after text diff", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const facts = loadFacts("pat-lee", fx.root);
    const variant = loadVariant("pat-lee", "data-analyst", fx.root);
    const theme = loadTheme("classic-blue", fx.root);
    const baseline = join(dir, "before.docx");
    await render(theme, resolveContent(facts, variant), baseline);
    const spec = { ...variant, output: "final", sections: [{ title: "Systems", labeled: ["systems"] }] };
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/resume-tailored.yaml", YAML.stringify({ type: "tailored-resume", person: "pat-lee", ...spec }));
    const final = join(dir, "final.docx");
    await render(theme, resolveContent(facts, spec), final);
    const report = await keywordReport(dir, fx.root, undefined, { baseline });
    assert.ok(report.matched.includes("rust"));
    assert.ok(!report.matched.includes("python"), "base variant Python is absent from actual final");
    assert.match(report.compared, /final.docx/);
    assert.ok(report.reviewDiff?.removed.some(x => x.includes("Python")));
    assert.ok(report.reviewDiff?.added.some(x => x.includes("Rust")));
    const output = execFileSync(process.execPath, [join(REAL_ROOT, "tools/src/cli.ts"), "keywords", dir, "--artifact", final, "--baseline", baseline], { env: { ...process.env, RESUMES_ROOT: fx.root }, encoding: "utf8" });
    assert.match(output, /wrote .*keywords.md/);
    const saved = readDoc(join(dir, "keywords.md")).body;
    assert.match(saved, /Compared:.*final.docx/);
    assert.match(saved, /Actual text review diff[\s\S]*Removed:[\s\S]*Python/);
  } finally { fx.cleanup(); }
});


test("unknown historical artifacts cannot be reconstructed from a current tailored spec", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const record = join(dir, "record.md");
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/record.md", readFileSync(record, "utf8").replace("status: drafted", "status: rejected"));
    fx.write("people/pat-lee/applications/2026-10-01_acme_data-analyst/resume-tailored.yaml", YAML.stringify({ type: "tailored-resume", person: "pat-lee", ...loadVariant("pat-lee", "data-analyst", fx.root) }));
    await assert.rejects(keywordReport(dir, fx.root), /historical sent artifact unknown/);
    const current = await keywordReport(dir, fx.root, "data-analyst");
    assert.match(current.compared, /current-source projection; final file unverified/);
  } finally { fx.cleanup(); }
});


test("actual review diff detects ordering changes even when every line is retained", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const facts = loadFacts("pat-lee", fx.root), variant = loadVariant("pat-lee", "data-analyst", fx.root);
    const theme = loadTheme("classic-blue", fx.root);
    const baseline = join(dir, "old-order.docx"), artifact = join(dir, "new-order.docx");
    await render(theme, resolveContent(facts, variant), baseline);
    await render(theme, resolveContent(facts, { ...variant, sections: [...variant.sections].reverse() }), artifact);
    const report = await keywordReport(dir, fx.root, undefined, { artifact, baseline });
    assert.ok(report.reviewDiff?.removed.length, "moved text is visible as removed at its old position");
    assert.ok(report.reviewDiff?.added.length, "moved text is visible as added at its new position");
  } finally { fx.cleanup(); }
});
