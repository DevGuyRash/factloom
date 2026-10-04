import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture } from "./helpers/fixture.ts";
import { parse, stringify } from "../src/lib/frontmatter.ts";
import { normalizeCompany, normalizeUrl, similarity, slugify } from "../src/lib/text.ts";
import { collectSets, parseArgs } from "../src/lib/args.ts";
import { DOC_TYPES, ENUMS, APPLICATION_DIR } from "../src/lib/schema.ts";

test("frontmatter round-trips data and body", () => {
  const text = stringify({ type: "notes", person: "pat-lee", list: ["a", "b"] }, "# Title\n\nBody\n");
  const { data, body } = parse(text);
  assert.deepEqual(data, { type: "notes", person: "pat-lee", list: ["a", "b"] });
  assert.equal(body.trim(), "# Title\n\nBody");
  assert.equal(parse("no frontmatter").data, null);
});

test("text helpers normalize for duplicate detection", () => {
  assert.equal(slugify("Mercy General Hospital, Inc."), "mercy-general-hospital-inc");
  assert.equal(normalizeCompany("Acme, Inc."), normalizeCompany("ACME"));
  assert.ok(similarity("Senior AI Engineer", "AI Engineer, Senior") > 0.9);
  assert.equal(normalizeUrl("https://jobs.example.com/x/123/?utm_source=li&gh_jid=9#apply"), "https://jobs.example.com/x/123?gh_jid=9");
});

test("args parse positionals, flags, and --set pairs", () => {
  const a = parseArgs(["new", "--company", "Acme", "--force", "--role=AI Engineer"], ["force"]);
  assert.deepEqual(a._, ["new"]);
  assert.equal(a.flags.company, "Acme");
  assert.equal(a.flags.force, true);
  assert.equal(a.flags.role, "AI Engineer");
  assert.deepEqual(collectSets(["--set", "company=Acme", "--set=job.role=AI"]), { company: "Acme", job: { role: "AI" } });
});

test("schema enums refer to known types", () => {
  for (const e of ENUMS) assert.ok(e.type in DOC_TYPES, e.type);
  assert.ok(APPLICATION_DIR.test("2026-10-01_acme_ai-engineer"));
  assert.ok(!APPLICATION_DIR.test("Acme AI Engineer"));
});

test("templates resolve person overrides before shared ones", async () => {
  const fx = makeFixture({ "people/pat-lee/templates/posting.md.hbs": "---\ntype: posting\nperson: {{person}}\ncompany: {{company}}\nrole: {{role}}\n---\nOVERRIDE\n" });
  try {
    const { renderTemplate, resolveTemplate } = await import("../src/lib/templates.ts");
    assert.match(resolveTemplate("posting", "pat-lee", fx.root), /people\/pat-lee\/templates/);
    assert.match(resolveTemplate("posting", undefined, fx.root), /shared\/templates\/documents/);
    assert.match(renderTemplate("posting", { person: "pat-lee", company: "Acme", role: "AI" }, "pat-lee", fx.root), /OVERRIDE/);
  } finally { fx.cleanup(); }
});

test("applications are created from templates and duplicates are found", async () => {
  const fx = makeFixture();
  try {
    const { createApplication, findDuplicate, listApplications } = await import("../src/lib/applications.ts");
    const app = createApplication("pat-lee", { company: "Acme, Inc.", role: "AI Engineer", url: "https://boards.example.com/acme/123?utm_source=x", date: "2026-10-01" }, fx.root);
    assert.equal(app.name, "2026-10-01_acme-inc_ai-engineer");
    assert.equal(app.record?.status, "drafted");
    assert.equal(app.posting?.type, "posting");
    assert.match(readFileSync(join(app.dir, "record.md"), "utf8"), /^company: "Acme, Inc\."$/m);
    assert.ok(findDuplicate("pat-lee", { company: "ACME", role: "AI Engineer" }, fx.root));
    assert.ok(findDuplicate("pat-lee", { company: "Other", role: "x", url: "https://boards.example.com/acme/123" }, fx.root));
    assert.equal(findDuplicate("pat-lee", { company: "Acme", role: "Accountant" }, fx.root), null);
    assert.equal(listApplications("pat-lee", fx.root).length, 1);
    assert.throws(() => createApplication("pat-lee", { company: "Acme, Inc.", role: "AI Engineer", date: "2026-10-01" }, fx.root), /already exists/);
    // The job-board link an application was found through also identifies it, with or without company and role.
    createApplication("pat-lee", { company: "Beta", role: "Analyst", url: "https://beta.example/careers/7", source: "https://board.example/view/42", date: "2026-10-02" }, fx.root);
    assert.ok(findDuplicate("pat-lee", { url: "https://board.example/view/42?utm_source=feed" }, fx.root));
    const { enqueue } = await import("../src/lib/queue.ts");
    assert.equal(enqueue("pat-lee", { url: "https://board.example/view/42" }, fx.root).reason, "applied");
  } finally { fx.cleanup(); }
});

test("queue dedupes, orders by score, and resumes in-progress work", async () => {
  const fx = makeFixture();
  try {
    const { enqueue, nextItem, updateItem, loadQueue } = await import("../src/lib/queue.ts");
    assert.equal(enqueue("pat-lee", { url: "https://x.example/1", company: "A", role: "R1", score: 40 }, fx.root).added, true);
    assert.equal(enqueue("pat-lee", { url: "https://x.example/2", company: "B", role: "R2", score: 90 }, fx.root).added, true);
    assert.equal(enqueue("pat-lee", { url: "https://x.example/1?utm_source=z" }, fx.root).reason, "queued");
    assert.equal(nextItem("pat-lee", fx.root)?.url, "https://x.example/2");
    updateItem("pat-lee", "https://x.example/1", { status: "in-progress" }, fx.root);
    assert.equal(nextItem("pat-lee", fx.root)?.url, "https://x.example/1");
    assert.equal(loadQueue("pat-lee", fx.root).items.length, 2);
  } finally { fx.cleanup(); }
});
