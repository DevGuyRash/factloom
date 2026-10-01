import assert from "node:assert";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import draftCmd from "../src/commands/draft.ts";
import { createCompany } from "../src/lib/companies.ts";
import { makeFixture } from "./helpers/fixture.ts";

const STORIES = `---\ntype: stories\nperson: pat-lee\n---\n\n### automating-own-workflow\n\n- Competencies: automation, ownership\n- Situation: Acme's AP work spans Jira and Oracle Fusion.\n- Action: Built a Rust/WebAssembly rule engine to automate it.\n- Result: The team adopted it.\n\n### large-stakeholder-programs\n\n- Competencies: stakeholder management\n- Situation: A statewide program spanned 200+ districts.\n- Action: Served as primary contact.\n- Result: Reporting stayed coordinated.\n`;

const RECORD = `---\ntype: application\nperson: pat-lee\ncompany: "Acme Corp"\nrole: "AI Engineer"\nstatus: drafted\napplied: 2026-09-20\nupdated: 2026-09-30\n---\n\n# Acme Corp — AI Engineer\n`;

const POSTING = `---\ntype: posting\nperson: pat-lee\ncompany: "Acme Corp"\nrole: "AI Engineer"\ncaptured: 2026-09-20\n---\n\n# AI Engineer — Acme Corp\n\n## Description\n\nAutomate Jira and Oracle Fusion workflows with Rust and WebAssembly rule engines.\n`;

function fixtureWithApplication() {
  const fx = makeFixture({
    "people/pat-lee/stories.md": STORIES,
    "people/pat-lee/applications/2026-09-20_acme-corp_ai-engineer/record.md": RECORD,
    "people/pat-lee/applications/2026-09-20_acme-corp_ai-engineer/posting.md": POSTING,
  });
  return { fx, dir: join(fx.root, "people/pat-lee/applications/2026-09-20_acme-corp_ai-engineer") };
}

test("draft follow-up renders person, company, role, and a matching story", () => {
  const { fx, dir } = fixtureWithApplication();
  try {
    const code = draftCmd.run(["follow-up", dir]);
    assert.equal(code, 0);
    const out = join(dir, "follow-up.md");
    assert.ok(existsSync(out));
    const text = readFileSync(out, "utf8");
    assert.match(text, /^---\ntype: follow-up\n/);
    assert.match(text, /person: pat-lee/);
    assert.match(text, /company: "Acme Corp"/);
    assert.match(text, /Pat Lee/);
  } finally {
    fx.cleanup();
  }
});

test("draft interview-prep pulls in the company dossier and the best-matching story", () => {
  const { fx, dir } = fixtureWithApplication();
  try {
    createCompany("Acme Corp", { website: "https://acme.example" }, fx.root);
    const code = draftCmd.run(["interview-prep", dir]);
    assert.equal(code, 0);
    const text = readFileSync(join(dir, "interview-prep.md"), "utf8");
    assert.match(text, /^---\ntype: interview-prep\n/);
    assert.match(text, /Automate Jira and Oracle Fusion/);
    assert.match(text, /automating-own-workflow/);
    assert.match(text, /What's changed recently at Acme Corp/);
  } finally {
    fx.cleanup();
  }
});

test("draft refuses to overwrite an existing draft without --force", () => {
  const { fx, dir } = fixtureWithApplication();
  try {
    assert.equal(draftCmd.run(["thank-you", dir]), 0);
    assert.equal(draftCmd.run(["thank-you", dir]), 1);
    assert.equal(draftCmd.run(["thank-you", dir, "--force"]), 0);
  } finally {
    fx.cleanup();
  }
});
