// build-resumes: fixture tests for the render pipeline and guide derivation.
import assert from "node:assert";
import { mkdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import JSZip from "jszip";
import { buildVariant } from "../src/commands/build-resumes.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { listGenerated, staleGenerated } from "../src/lib/generated.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

async function documentXml(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error(`${file}: word/document.xml missing`);
  return entry.async("string");
}
const textOf = (xml: string) => xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

type Fixture = ReturnType<typeof makeFixture>;

function seedFixture(fx: Fixture): void {
  fx.write("shared/templates/themes/classic-blue.json", readFileSync(join(REAL_ROOT, "shared", "templates", "themes", "classic-blue.json"), "utf8"));
  fx.write("people/pat-lee/resumes/source/facts.yaml", `
person: pat-lee
name: Pat Lee
contact:
  - text: Phoenix, AZ
skills:
  data: { label: "Data", items: "SQL, Python" }
projects:
  widgets:
    title: "Widgets Inc | Internal Tooling"
    dates: "2024 - Present"
    bullets:
      - text: "Shipped a **widget** pipeline that needs confirmation."
        confirm: ["needs confirmation"]
      - text: "Shipped a second widget with no open questions."
lines:
  edu1: { left: "State University", rest: " | B.S. Computer Science" }
`);
  fx.write("people/pat-lee/resumes/source/variants/test-variant.yaml", `
variant: test-variant
theme: classic-blue
headline: "Data Analyst"
output: Pat_Lee_Resume
sections:
  - title: Technical Skills
    labeled: [data]
  - title: Projects
    entries:
      - project: widgets
  - title: Education
    lines: [edu1]
`);
  fx.write("people/pat-lee/resumes/active/test-variant/guide.md", `---
type: resume-guide
person: pat-lee
status: ready
use_for: [placeholder]
review: []
---
Placeholder guide body, kept as-is by the builder.
`);
}

test("build-resumes renders a variant from facts.yaml + variant YAML and derives the guide", async () => {
  const fx = makeFixture();
  try {
    seedFixture(fx);
    const dir = join(fx.root, "people", "pat-lee", "resumes", "active", "test-variant");
    const files = await buildVariant("pat-lee", "test-variant", dir, fx.root);
    const docx = files.find((f) => f.endsWith(".docx"));
    assert.ok(docx, "a .docx was written");
    const text = textOf(await documentXml(docx!));
    for (const s of ["Pat Lee", "Data Analyst", "Data: SQL, Python", "Widgets Inc", "widget pipeline", "State University"]) assert.ok(text.includes(s), s);

    const { data } = readDoc(join(dir, "guide.md"));
    assert.deepStrictEqual(data.review, ["Confirm: needs confirmation"]);
    assert.strictEqual(data.status, "needs-review");
    assert.strictEqual(data.generated, true, "the guide records that its files are built from source");
    assert.deepStrictEqual(data.use_for, ["placeholder"], "unrelated fields stay untouched");
  } finally {
    fx.cleanup();
  }
});

test("build-resumes clears review and marks ready when no bullet needs confirmation", async () => {
  const fx = makeFixture();
  try {
    seedFixture(fx);
    // Drop the confirm flag so this variant's only bullet needs no review.
    fx.write("people/pat-lee/resumes/source/facts.yaml", readFileSync(join(fx.root, "people/pat-lee/resumes/source/facts.yaml"), "utf8").replace(/\n\s*confirm: \[.*\]\n/, "\n"));
    const dir = join(fx.root, "people", "pat-lee", "resumes", "active", "test-variant");
    await buildVariant("pat-lee", "test-variant", dir, fx.root);
    const { data } = readDoc(join(dir, "guide.md"));
    assert.deepStrictEqual(data.review, []);
    assert.strictEqual(data.status, "ready");
  } finally {
    fx.cleanup();
  }
});

test("build-resumes keeps hand-written review items and leaves guides alone for review copies", async () => {
  const fx = makeFixture();
  try {
    seedFixture(fx);
    const guide = join(fx.root, "people/pat-lee/resumes/active/test-variant/guide.md");
    fx.write("people/pat-lee/resumes/active/test-variant/guide.md", readFileSync(guide, "utf8").replace("review: []", 'review:\n  - "Confirm with Pat that this resume is current."'));
    const outDir = join(fx.root, "review-copy");
    mkdirSync(outDir, { recursive: true });
    await buildVariant("pat-lee", "test-variant", outDir, fx.root);
    assert.deepStrictEqual(readDoc(guide).data.review, ["Confirm with Pat that this resume is current."], "a review copy leaves the guide untouched");
    fx.write("people/pat-lee/resumes/source/facts.yaml", readFileSync(join(fx.root, "people/pat-lee/resumes/source/facts.yaml"), "utf8").replace(/\n\s*confirm: \[.*\]\n/, "\n"));
    await buildVariant("pat-lee", "test-variant", join(fx.root, "people/pat-lee/resumes/active/test-variant"), fx.root);
    const { data } = readDoc(guide);
    assert.deepStrictEqual(data.review, ["Confirm with Pat that this resume is current."]);
    assert.strictEqual(data.status, "needs-review", "a hand-written item still gates the resume");
  } finally {
    fx.cleanup();
  }
});

// Every resume whose guide says `generated: true` must rebuild to exactly the committed .docx (the
// document XML, with Word's random link ids normalized), in this checkout's people/ and in the demo.
// A failure after an engine update means the renderer changed the output: rebuild, review, commit.
test("generated resumes rebuild to exactly the committed files", async (t) => {
  const roots = [REAL_ROOT, join(REAL_ROOT, "examples", "demo")];
  const checked = roots.flatMap((root) => listGenerated(root));
  if (!checked.length) { t.skip("no generated resumes to check"); return; }
  for (const root of roots) {
    const stale = await staleGenerated(root);
    assert.deepStrictEqual(stale.map((g) => `${g.person}/${g.variant}`), [], "rebuild these with `resumes build-resumes --person <p> --variant <v>` and review");
  }
});
