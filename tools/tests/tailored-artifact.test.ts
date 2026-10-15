import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";
import appCommand from "../src/commands/app.ts";
import { rebuildTailored, tailorApplication } from "../src/commands/tailor.ts";
import { readDoc, writeDoc } from "../src/lib/frontmatter.ts";
import { extractDocumentText } from "../src/lib/pii.ts";
import { makeFixture, verifyFixtureApplication } from "./helpers/fixture.ts";

function seed() {
  const fx = makeFixture();
  const person = "people/pat-lee";
  const facts = `${person}/resumes/source/facts.yaml`;
  fx.write(facts, `person: pat-lee
name: Pat Lee
contact: [{ text: pat@example.com }]
skills: {}
jobs: {}
projects:
  widget:
    title: Fictional Widgets
    bullets: [{ text: Built a Python pipeline for a fictional demonstration. }]
lines: {}
`);
  fx.write(`${person}/resumes/source/variants/general.yaml`, `variant: general
theme: classic-blue
headline: Fictional engineer
output: Pat_Lee_Resume
sections:
  - title: Projects
    entries: [{ project: widget }]
`);
  const app = `${person}/applications/2026-10-01_example_python`;
  fx.write(`${app}/record.md`, `---
type: application
person: pat-lee
company: Example
role: Python
status: drafted
updated: 2026-10-01
resume: general
---
`);
  fx.write(`${app}/posting.md`, `---
type: posting
person: pat-lee
company: Example
role: Python
captured: 2026-10-01
---
Python work for this fictional fixture.
`);
  verifyFixtureApplication(fx.root, app);
  return { ...fx, dir: join(fx.root, app), facts: join(fx.root, facts) };
}

function withRoot<T>(root: string, fn: () => T): T {
  const before = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = root;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.RESUMES_ROOT;
    else process.env.RESUMES_ROOT = before;
  }
}

test("tailor and --spec refuse all sent or pending-click overwrites before touching historical bytes", async () => {
  for (const fields of [{ status: "submitted", applied: "2026-10-01" }, { status: "rejected" }, { status: "withdrawn" }, { status: "drafted", events: [{ kind: "submitted" }] }, { submit_clicked: "2026-10-01T12:00:00Z" }]) {
    const fx = seed();
    try {
      const built = await tailorApplication(fx.dir, {}, fx.root);
      const before = new Map([built.specPath, ...built.files].map((p) => [p, readFileSync(p)]));
      const rec = readDoc(join(fx.dir, "record.md"));
      writeDoc(join(fx.dir, "record.md"), { ...rec.data, ...fields }, rec.body);
      writeFileSync(fx.facts, readFileSync(fx.facts, "utf8").replace("Built a Python", "Changed a Python"));
      await assert.rejects(tailorApplication(fx.dir, {}, fx.root), /sent|submission|submit click/i);
      await assert.rejects(rebuildTailored(fx.dir, {}, fx.root), /sent|submission|submit click/i);
      for (const [path, bytes] of before) assert.deepEqual(readFileSync(path), bytes);
    } finally { fx.cleanup(); }
  }
});

test("explicit revision builds separately, never overwrites sent files or changes their application association", async () => {
  const fx = seed();
  try {
    const built = await tailorApplication(fx.dir, {}, fx.root);
    const oldSpec = readFileSync(built.specPath);
    const oldDocx = readFileSync(built.files.find((p) => p.endsWith(".docx"))!);
    const recordPath = join(fx.dir, "record.md");
    const rec = readDoc(recordPath);
    writeDoc(recordPath, { ...rec.data, status: "submitted", applied: "2026-10-01" }, rec.body);
    const record = readFileSync(recordPath);
    const revised = await tailorApplication(fx.dir, { revision: "follow-up-1" }, fx.root);
    assert.equal(revised.specPath, join(fx.dir, "revisions/follow-up-1/resume-tailored.yaml"));
    assert.ok(revised.files.every((p) => p.startsWith(join(fx.dir, "revisions/follow-up-1/"))));
    assert.deepEqual(readFileSync(built.specPath), oldSpec);
    assert.deepEqual(readFileSync(built.files.find((p) => p.endsWith(".docx"))!), oldDocx);
    assert.deepEqual(readFileSync(recordPath), record);
    await assert.rejects(tailorApplication(fx.dir, { revision: "follow-up-1" }, fx.root), /exists|revision/i);
    await assert.rejects(tailorApplication(fx.dir, { revision: "../outside" }, fx.root), /revision/i);
  } finally { fx.cleanup(); }
});

test("tailor --spec rejects owner mismatch and output traversal before writing", async () => {
  const fx = seed();
  try {
    const built = await tailorApplication(fx.dir, {}, fx.root);
    const spec = YAML.parse(readFileSync(built.specPath, "utf8"));
    writeFileSync(built.specPath, YAML.stringify({ ...spec, person: "someone-else" }));
    await assert.rejects(rebuildTailored(fx.dir, {}, fx.root), /owner|person/i);
    writeFileSync(built.specPath, YAML.stringify({ ...spec, output: "../escape" }));
    await assert.rejects(rebuildTailored(fx.dir, {}, fx.root), /output|basename/i);
    assert.equal(existsSync(join(fx.dir, "../escape.docx")), false);
  } finally { fx.cleanup(); }
});

test("submission freezes exact existing tailored bytes and original source, then associates that snapshot with confirmation", async () => {
  const fx = seed();
  try {
    const originalFacts = readFileSync(fx.facts, "utf8");
    const built = await tailorApplication(fx.dir, {}, fx.root);
    const docx = built.files.find((p) => p.endsWith(".docx"))!;
    const bytes = readFileSync(docx);
    writeFileSync(fx.facts, originalFacts.replace("Built a Python", "Later mutable Python"));
    assert.equal(withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--artifact", docx, "--person", "pat-lee"])), 0);
    const clicked = readDoc(join(fx.dir, "record.md")).data;
    const association = clicked.submission_artifact as { snapshot: string; state: string };
    assert.equal(association?.state, "pending");
    const manifestPath = join(fx.dir, association.snapshot);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.person, "pat-lee");
    assert.equal(manifest.identity.mode, "genuine_career");
    assert.equal(manifest.selected_file, "Pat_Lee_Resume_example.docx");
    assert.deepEqual(readFileSync(join(manifestPath, "..", "files", "Pat_Lee_Resume_example.docx")), bytes);
    assert.equal(manifest.source.facts, originalFacts);
    assert.equal(withRoot(fx.root, () => appCommand.run(["submit", fx.dir, "--confirmation", "Fictional receipt", "--person", "pat-lee"])), 0);
    const submitted = readDoc(join(fx.dir, "record.md")).data.submission_artifact as typeof association;
    assert.equal(submitted.snapshot, association.snapshot);
    assert.equal(submitted.state, "submitted");
    assert.deepEqual(readFileSync(docx), bytes);
  } finally { fx.cleanup(); }
});

test("recording an old submission without a click snapshot preserves unknown artifact history", () => {
  const fx = seed();
  try {
    assert.equal(withRoot(fx.root, () => appCommand.run(["submit", fx.dir, "--on", "2024-01-01", "--person", "pat-lee"])), 0);
    const association = readDoc(join(fx.dir, "record.md")).data.submission_artifact as { state: string; snapshot: null };
    assert.equal(association?.state, "unknown");
    assert.equal(association.snapshot, null);
    assert.equal(existsSync(join(fx.dir, "sent-artifacts")), false);
  } finally { fx.cleanup(); }
});

test("synthetic identity survives evidence-only controls and cannot be submitted through a genuine application or relabeled", async () => {
  const fx = seed();
  try {
    writeFileSync(fx.facts, `mode: synthetic_research\nbatch_id: demo-batch\n${readFileSync(fx.facts, "utf8")}`);
    fx.write("people/pat-lee/resumes/source/research-controls.yaml", "mode: synthetic_research\nbatch_id: demo-batch\nevidence_only: true\n");
    const built = await tailorApplication(fx.dir, {}, fx.root);
    const spec = YAML.parse(readFileSync(built.specPath, "utf8"));
    assert.equal(spec.mode, "synthetic_research");
    assert.equal(spec.batch_id, "demo-batch");
    const recordPath = join(fx.dir, "record.md");
    const original = readFileSync(recordPath);
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"])), /research_batch|synthetic/i);
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submit", fx.dir, "--person", "pat-lee"])), /research_batch|synthetic/i);
    assert.deepEqual(readFileSync(recordPath), original);
    assert.equal(existsSync(join(fx.dir, "sent-artifacts")), false);
    const rec = readDoc(recordPath);
    writeDoc(recordPath, { ...rec.data, url: "https://example.test/test-route", research_batch: "demo-batch", research_scope: {
      authorized: true, company_authorized: true, companies: ["Example"], routes: ["https://example.test/test-route"], actions: ["submit"], stopping_condition: "One fictional authorized test attempt",
    } }, rec.body);
    verifyFixtureApplication(fx.root, fx.dir);
    assert.equal(withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"])), 0);
    assert.equal(withRoot(fx.root, () => appCommand.run(["submit", fx.dir, "--person", "pat-lee"])), 0);
  } finally { fx.cleanup(); }
});

test("synthetic and genuine source identity conflicts fail before writing any tailored file", async () => {
  const fx = seed();
  try {
    writeFileSync(fx.facts, `mode: synthetic_research\nbatch_id: demo-batch\n${readFileSync(fx.facts, "utf8")}`);
    fx.write("people/pat-lee/resumes/source/research-controls.yaml", "mode: genuine_career\n");
    await assert.rejects(tailorApplication(fx.dir, {}, fx.root), /conflicting artifact modes/);
    assert.equal(existsSync(join(fx.dir, "resume-tailored.yaml")), false);
  } finally { fx.cleanup(); }
});

test("frozen evidence retains original source revision after current facts change and detects snapshot tampering", async () => {
  const fx = seed();
  try {
    const { readSubmissionArtifact } = await import("../src/lib/tailored-artifact.ts");
    await tailorApplication(fx.dir, {}, fx.root);
    withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"]));
    const record = readDoc(join(fx.dir, "record.md")).data;
    writeFileSync(fx.facts, readFileSync(fx.facts, "utf8").replace("Built a Python", "Changed a Python"));
    const frozen = readSubmissionArtifact(fx.dir, record);
    assert.match(frozen.source_revision!, /^sha256:[a-f0-9]{64}$/);
    const association = record.submission_artifact as { snapshot: string };
    const oldSpec = join(fx.dir, association.snapshot, "..", "resume-tailored.yaml");
    writeFileSync(oldSpec, readFileSync(oldSpec, "utf8") + "\n# changed after freeze\n");
    assert.throws(() => readSubmissionArtifact(fx.dir, record), /integrity mismatch/);
  } finally { fx.cleanup(); }
});

test("legacy tailored bytes with synthetic controls require research scope without inventing original source provenance", async () => {
  const fx = seed();
  try {
    const built = await tailorApplication(fx.dir, {}, fx.root);
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(fx.dir, "tailored-artifact.json"));
    const spec = YAML.parse(readFileSync(built.specPath, "utf8"));
    delete spec.mode;
    writeFileSync(built.specPath, YAML.stringify(spec));
    fx.write("people/pat-lee/resumes/source/research-controls.yaml", "mode: synthetic_research\nbatch_id: legacy-demo\n");
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"])), /research_batch|synthetic/i);
    assert.equal(existsSync(join(fx.dir, "sent-artifacts")), false);
  } finally { fx.cleanup(); }
});


test("retained candidates alone never establish which format was uploaded", async () => {
  const fx = seed();
  try {
    const { readSubmissionArtifact } = await import("../src/lib/tailored-artifact.ts");
    const built = await tailorApplication(fx.dir, {}, fx.root);
    withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"]));
    const record = readDoc(join(fx.dir, "record.md")).data;
    const frozen = readSubmissionArtifact(fx.dir, record);
    assert.equal(frozen.selected_file, null);
    assert.equal(frozen.files.length, built.files.length);
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--artifact", built.files[0], "--person", "pat-lee"])), /selection|reassign/);
  } finally { fx.cleanup(); }
});

test("tailor rejects dangling output symlinks rather than creating a document outside the application", { skip: process.platform === "win32" }, async () => {
  const fx = seed();
  try {
    const { symlinkSync } = await import("node:fs");
    const target = join(fx.root, "outside-application.docx");
    symlinkSync(target, join(fx.dir, "Pat_Lee_Resume_example.docx"));
    await assert.rejects(tailorApplication(fx.dir, {}, fx.root), /symlink/);
    assert.equal(existsSync(target), false);
  } finally { fx.cleanup(); }
});

test("a pending upload selection cannot be repeated using foreign bytes with the same basename", async () => {
  const fx = seed();
  try {
    const built = await tailorApplication(fx.dir, {}, fx.root);
    const docx = built.files.find((p) => p.endsWith(".docx"))!;
    withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--artifact", docx, "--person", "pat-lee"]));
    const foreign = fx.write("Pat_Lee_Resume_example.docx", "not the selected bytes");
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--artifact", foreign, "--person", "pat-lee"])), /owner|inside|selected|artifact/i);
  } finally { fx.cleanup(); }
});

test("changing only captured source metadata fails immutable snapshot verification", async () => {
  const fx = seed();
  try {
    const { readSubmissionArtifact } = await import("../src/lib/tailored-artifact.ts");
    await tailorApplication(fx.dir, {}, fx.root);
    withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"]));
    const record = readDoc(join(fx.dir, "record.md")).data;
    const a = record.submission_artifact as { snapshot: string };
    const path = join(fx.dir, a.snapshot);
    const m = JSON.parse(readFileSync(path, "utf8"));
    m.source.facts += "\n# changed after freeze\n";
    writeFileSync(path, JSON.stringify(m));
    assert.throws(() => readSubmissionArtifact(fx.dir, record), /integrity|digest/i);
  } finally { fx.cleanup(); }
});

test("known unconfirmed previews cannot be marked as uploads or recorded as submissions", async () => {
  const fx = seed();
  try {
    const facts = YAML.parse(readFileSync(fx.facts, "utf8"));
    facts.projects.widget.bullets[0].confirm = ["Python pipeline"];
    writeFileSync(fx.facts, YAML.stringify(facts));
    const built = await tailorApplication(fx.dir, { allowUnconfirmed: true }, fx.root);
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--artifact", built.files[0], "--person", "pat-lee"])), /preview|unconfirmed/i);
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submit", fx.dir, "--person", "pat-lee"])), /preview|unconfirmed/i);
    assert.equal(readDoc(join(fx.dir, "record.md")).data.status, "drafted");
  } finally { fx.cleanup(); }
});

test("unknown-byte synthetic history retains its restriction when submission scope is revoked", () => {
  const fx = seed();
  try {
    fx.write("people/pat-lee/resumes/source/research-controls.yaml", "mode: synthetic_research\nbatch_id: no-file-test\n");
    const path = join(fx.dir, "record.md");
    const rec = readDoc(path);
    writeDoc(path, { ...rec.data, url: "https://example.test/research", research_batch: "no-file-test", research_scope: {
      authorized: true, company_authorized: true, companies: ["Example"], routes: ["https://example.test/research"], actions: ["submit"], stopping_condition: "One fictional test",
    } }, rec.body);
    verifyFixtureApplication(fx.root, fx.dir);
    withRoot(fx.root, () => appCommand.run(["submitting", fx.dir, "--person", "pat-lee"]));
    const clicked = readDoc(path);
    assert.equal((clicked.data.submission_artifact as {state: string}).state, "unknown");
    writeDoc(path, { ...clicked.data, research_scope: { ...(clicked.data.research_scope as object), authorized: false } }, clicked.body);
    assert.throws(() => withRoot(fx.root, () => appCommand.run(["submit", fx.dir, "--person", "pat-lee"])), /synthetic|research/i);
  } finally { fx.cleanup(); }
});


test("an existing unsent revision can be edited and rebuilt without touching sent root files", async () => {
  const fx = seed();
  try {
    const original = await tailorApplication(fx.dir, {}, fx.root);
    const originalBytes = new Map([original.specPath, ...original.files].map(p => [p, readFileSync(p)]));
    const recordPath = join(fx.dir, "record.md"), record = readDoc(recordPath);
    writeDoc(recordPath, { ...record.data, status: "rejected", applied: "2026-10-01" }, record.body);
    const revision = await tailorApplication(fx.dir, { revision: "follow-up" }, fx.root);
    const spec = YAML.parse(readFileSync(revision.specPath, "utf8"));
    spec.sections[0].entries[0].bullets = [];
    writeFileSync(revision.specPath, YAML.stringify(spec));
    const rebuilt = await rebuildTailored(fx.dir, { revision: "follow-up" }, fx.root);
    assert.equal(rebuilt.specPath, revision.specPath);
    const text = await extractDocumentText(rebuilt.files.find(p => p.endsWith(".docx"))!);
    assert.ok(text !== null);
    assert.doesNotMatch(text, /Built a Python pipeline/);
    for (const [path, bytes] of originalBytes) assert.deepEqual(readFileSync(path), bytes);
  } finally { fx.cleanup(); }
});
