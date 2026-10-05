// tailor: reorders an existing variant's bullets/entries/skills by posting-keyword overlap, and
// refuses when the variant still carries unconfirmed claims.
import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import YAML from "yaml";
import { rebuildTailored, tailorApplication } from "../src/commands/tailor.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

function seed(fx: ReturnType<typeof makeFixture>, confirm = false): string {
  fx.write("shared/lexicon.yaml", readFileSync(join(REAL_ROOT, "shared", "lexicon.yaml"), "utf8"));
  fx.write("shared/templates/themes/classic-blue.json", readFileSync(join(REAL_ROOT, "shared", "templates", "themes", "classic-blue.json"), "utf8"));
  fx.write("people/pat-lee/resumes/source/facts.yaml", `
person: pat-lee
name: Pat Lee
contact: [{ text: "Phoenix, AZ" }]
skills: {}
projects:
  widgets:
    title: "Widgets"
    bullets:
      - text: "Shipped a Python data pipeline."${confirm ? "\n        confirm: [\"needs confirmation\"]" : ""}
      - text: "Organized the office supply closet."
lines: {}
`);
  fx.write("people/pat-lee/resumes/source/variants/general.yaml", `
variant: general
theme: classic-blue
headline: "Generalist"
output: Pat_Lee_Resume
sections:
  - title: Projects
    entries:
      - project: widgets
        bullets: [1, 0]
`);
  const appDir = "people/pat-lee/applications/2026-10-01_acme_python-role";
  fx.write(`${appDir}/record.md`, `---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "Python Role"\nstatus: drafted\nupdated: 2026-10-01\nresume: general\n---\n`);
  fx.write(`${appDir}/posting.md`, `---\ntype: posting\nperson: pat-lee\ncompany: "Acme"\nrole: "Python Role"\ncaptured: 2026-10-01\n---\n\n## Description\n\nWe need strong Python experience.\n`);
  return join(fx.root, appDir);
}

test("tailor reorders bullets toward the posting's keywords without adding new text", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    const { specPath, files } = await tailorApplication(dir, {}, fx.root);
    const spec = YAML.parse(readFileSync(specPath, "utf8")) as { sections: { entries: { bullets: number[] }[] }[] };
    assert.deepStrictEqual(spec.sections[0].entries[0].bullets, [0, 1], "the Python bullet (index 0) now leads, matching the posting");
    assert.ok(files.some((f) => f.endsWith(".docx")), "a docx was rendered beside the spec");
    // The employer's name tells this upload apart from other tailored copies on boards that list them by name.
    assert.ok(files.every((f) => /_acme\.(docx|pdf)$/.test(f)), files.join(", "));
  } finally {
    fx.cleanup();
  }
});

test("tailor refuses a variant with unconfirmed claims; --allow-unconfirmed builds a preview named as one", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx, true);
    await assert.rejects(tailorApplication(dir, {}, fx.root), /awaiting the person's confirmation[\s\S]*hold the application[\s\S]*never a file to send/);
    const { files } = await tailorApplication(dir, { allowUnconfirmed: true }, fx.root);
    assert.ok(files.length, "proceeds once --allow-unconfirmed is passed");
    assert.ok(files.every((f) => /_PREVIEW_unconfirmed\.(docx|pdf)$/.test(f)), files.join(", "));
  } finally {
    fx.cleanup();
  }
});

test("tailor --spec renders the agent's own choice of the person's facts, and refuses wording they have not reviewed", async () => {
  const fx = makeFixture();
  try {
    const dir = seed(fx);
    // A second job the variant leaves out: the agent may bring it in for this posting.
    const factsPath = join(fx.root, "people/pat-lee/resumes/source/facts.yaml");
    writeFileSync(factsPath, readFileSync(factsPath, "utf8").replace("lines: {}", "jobs:\n  acme:\n    title: \"Data Analyst\"\n    bullets:\n      - text: \"Automated weekly reports in Python.\"\nlines: {}"));
    const { specPath } = await tailorApplication(dir, {}, fx.root);
    const spec = YAML.parse(readFileSync(specPath, "utf8"));
    spec.sections.unshift({ title: "Experience", entries: [{ job: "acme" }] });
    writeFileSync(specPath, YAML.stringify(spec));
    const { files } = await rebuildTailored(dir, {}, fx.root);
    assert.ok(files.some((f) => f.endsWith(".docx")), "rendered from the edited spec");

    writeFileSync(specPath, YAML.stringify({ ...spec, headline: "Senior Python Architect" }));
    await assert.rejects(rebuildTailored(dir, {}, fx.root), /not reviewed: "Senior Python Architect"/);

    spec.sections[0].entries = [{ job: "nowhere" }];
    writeFileSync(specPath, YAML.stringify(spec));
    await assert.rejects(rebuildTailored(dir, {}, fx.root), /no job named nowhere/);
  } finally {
    fx.cleanup();
  }
});
