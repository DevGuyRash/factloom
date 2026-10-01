import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture } from "./helpers/fixture.ts";
import { parse } from "../src/lib/frontmatter.ts";

test("person new renders profile, answers, inbox, evidence from templates; variant new renders a guide", async () => {
  const fx = makeFixture();
  process.env.RESUMES_ROOT = fx.root;
  try {
    const person = (await import("../src/commands/person.ts")).default;
    assert.equal(await person.run(["new", "Jamie", "Rivera", "--email", "jamie@example.com", "--link", "https://example.com/jr"]), 0);
    const dir = join(fx.root, "people/jamie-rivera");
    const profile = parse(readFileSync(join(dir, "profile.md"), "utf8")).data!;
    assert.equal(profile.type, "profile");
    assert.equal(profile.name, "Jamie Rivera");
    assert.equal(profile.apply, "disabled");
    assert.deepEqual(profile.links, ["https://example.com/jr"]);
    for (const f of ["answers.md", "inbox.md", "evidence.md"]) assert.ok(existsSync(join(dir, f)), f);
    const profileText = readFileSync(join(dir, "profile.md"), "utf8");
    assert.match(profileText, /## Accounts and email[\s\S]*- New site accounts: held for the person[\s\S]*- Passwords: entered by the person[\s\S]*- Verification emails: read by the person/, "accounts stay with the person until they choose otherwise");
    assert.equal(await person.run(["new", "Jamie", "Rivera"]), 1);
    const variant = (await import("../src/commands/variant.ts")).default;
    assert.equal(await variant.run(["new", "Data Analyst", "--person", "jamie-rivera", "--headline", "Data Analyst | SQL"]), 0);
    const guide = parse(readFileSync(join(dir, "resumes/active/data-analyst/guide.md"), "utf8")).data!;
    assert.equal(guide.type, "resume-guide");
    assert.equal(guide.status, "needs-review");
    assert.equal(guide.headline, "Data Analyst | SQL");
    assert.ok("researched" in guide && !guide.researched, "a new guide starts unresearched");
    assert.match(readFileSync(join(dir, "resumes/active/data-analyst/guide.md"), "utf8"), /## Target roles[\s\S]*## Market notes/);
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("a newcomer's path: starter facts, an imported resume, a variant listing every fact, then a copy with --from", async () => {
  const fx = makeFixture();
  process.env.RESUMES_ROOT = fx.root;
  try {
    const YAML = (await import("yaml")).default;
    const person = (await import("../src/commands/person.ts")).default;
    assert.equal(await person.run(["new", "Riley", "Chen", "--email", "riley@example.com", "--phone", "(555) 010-0199", "--location", "Portland, OR", "--link", "https://example.com/riley"]), 0);
    const dir = join(fx.root, "people/riley-chen");
    const starter = YAML.parse(readFileSync(join(dir, "resumes/source/facts.yaml"), "utf8"));
    assert.equal(starter.name, "Riley Chen");
    assert.deepEqual(starter.contact, [
      { text: "Portland, OR" }, { text: "(555) 010-0199" },
      { text: "riley@example.com", url: "mailto:riley@example.com" }, { text: "example.com/riley", url: "https://example.com/riley" },
    ]);
    assert.deepEqual([starter.skills, starter.jobs, starter.projects, starter.lines], [{}, {}, {}, {}]);

    // Import an existing Word resume: the original is archived and its text lands beside the source.
    const { Document, Packer, Paragraph } = await import("docx");
    const { writeFileSync } = await import("node:fs");
    const original = join(fx.root, "Riley Chen Resume.docx");
    writeFileSync(original, await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Riley Chen"), new Paragraph("Analyst at Example Co., 2022 to now")] }] })));
    const { importResume } = await import("../src/commands/import.ts");
    const { note, original: kept } = await importResume(original, "riley-chen", fx.root);
    assert.ok(existsSync(kept) && kept.includes("resumes/archive/"), "the original is archived");
    const imported = parse(readFileSync(note, "utf8"));
    assert.equal(imported.data!.type, "notes");
    assert.match(imported.body, /Analyst at Example Co\., 2022 to now/);

    // With empty facts, variant new writes the structure but does not build.
    const variant = (await import("../src/commands/variant.ts")).default;
    assert.equal(await variant.run(["new", "analyst", "--person", "riley-chen", "--no-build"]), 0);
    const empty = YAML.parse(readFileSync(join(dir, "resumes/source/variants/analyst.yaml"), "utf8"));
    assert.equal(empty.theme, "classic-blue");
    assert.equal(empty.output, "Riley_Chen_Resume");

    // With facts, the starter structure lists every fact; --from copies a variant and can change its theme.
    writeFileSync(join(dir, "resumes/source/facts.yaml"), readFileSync(join(dir, "resumes/source/facts.yaml"), "utf8")
      .replace("skills: {}", 'skills:\n  data: { label: "Data", items: "SQL, Excel" }')
      .replace("jobs: {}", 'jobs:\n  example:\n    title: "Example Co. | Analyst"\n    dates: "2022 – Present"\n    bullets:\n      - text: "Built the weekly report."')
      .replace("lines: {}", 'lines:\n  degree: { left: "State University", rest: " | B.S.", right: "2021" }'));
    assert.equal(await variant.run(["new", "reporting", "--person", "riley-chen", "--no-build", "--headline", "Reporting Analyst"]), 0);
    const full = YAML.parse(readFileSync(join(dir, "resumes/source/variants/reporting.yaml"), "utf8"));
    assert.deepEqual(full.sections.map((s: { title: string }) => s.title), ["Skills", "Experience", "Education"]);
    assert.deepEqual(full.sections[1].entries, [{ job: "example" }]);
    assert.equal(await variant.run(["new", "reporting-modern", "--person", "riley-chen", "--from", "reporting", "--theme", "modern", "--no-build"]), 0);
    const copy = YAML.parse(readFileSync(join(dir, "resumes/source/variants/reporting-modern.yaml"), "utf8"));
    assert.equal(copy.variant, "reporting-modern");
    assert.equal(copy.theme, "modern");
    assert.deepEqual(copy.sections, full.sections);
    assert.equal(await variant.run(["new", "other", "--person", "riley-chen", "--theme", "no-such-theme"]), 1, "an unknown theme is refused");
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});
