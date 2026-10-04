// Ported 1:1 from the retired tools/tests/test_check.py (same fixtures, same assertions) plus a
// few new cases for the rules the Python checker never had (cover-letter-lint, docs-consistency).
import assert from "node:assert/strict";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import JSZip from "jszip";
import { run } from "../src/commands/check.ts";
import { makeFixture } from "./helpers/fixture.ts";

const GUIDE = "---\ntype: resume-guide\nperson: pat-lee\nstatus: ready\nuse_for:\n  - Data roles\n---\n";
const RECORD = "---\ntype: application\nperson: pat-lee\ncompany: Acme\nrole: Analyst\nstatus: submitted\napplied: 2026-09-01\nupdated: 2026-09-02\n---\n";
const ANSWERS = "---\ntype: answers\nperson: pat-lee\n---\n\n### work-auth.sponsorship\n- Answer: No\n- Policy: auto\n";

async function writeDocx(path: string, bodyText: string): Promise<void> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p></w:body></w:document>`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

/** Same shape as the Python test's setUp: a minimal but fully valid repository. */
async function validFixture() {
  const fx = makeFixture();
  fx.write("people/pat-lee/resumes/active/data/guide.md", GUIDE);
  await writeDocx(join(fx.root, "people/pat-lee/resumes/active/data/Pat_Lee_Resume.docx"), "Pat Lee Data Analyst");
  fx.write("people/pat-lee/applications/2026-09-01_acme_analyst/record.md", RECORD);
  fx.write("people/pat-lee/answers.md", ANSWERS);
  return fx;
}

test("valid repository passes", async () => {
  const fx = await validFixture();
  try {
    const { errors } = await run(fx.root);
    assert.deepEqual(errors, []);
  } finally {
    fx.cleanup();
  }
});

test("variant without guide fails", async () => {
  const fx = await validFixture();
  try {
    rmSync(join(fx.root, "people/pat-lee/resumes/active/data/guide.md"));
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("resume guide")));
  } finally {
    fx.cleanup();
  }
});

test("variant without resume file fails", async () => {
  const fx = await validFixture();
  try {
    rmSync(join(fx.root, "people/pat-lee/resumes/active/data/Pat_Lee_Resume.docx"));
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes(".pdf or .docx")));
  } finally {
    fx.cleanup();
  }
});

test("draft marker in active resume fails", async () => {
  const fx = await validFixture();
  try {
    await writeDocx(join(fx.root, "people/pat-lee/resumes/active/data/Pat_Lee_Resume.docx"), "CLASS PRESENTATION SAMPLE results are fictional");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("resume text contains")));
  } finally {
    fx.cleanup();
  }
});

test("marker in archive is allowed", async () => {
  const fx = await validFixture();
  try {
    await writeDocx(join(fx.root, "people/pat-lee/resumes/archive/2026-01-01_old.docx"), "placeholder");
    const { errors } = await run(fx.root);
    assert.deepEqual(errors, []);
  } finally {
    fx.cleanup();
  }
});

test("unknown application status fails", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/applications/2026-09-01_acme_analyst/record.md", RECORD.replace("submitted", "sent"));
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("status 'sent'")));
  } finally {
    fx.cleanup();
  }
});

test("application directory name is checked", async () => {
  const fx = await validFixture();
  try {
    renameSync(join(fx.root, "people/pat-lee/applications/2026-09-01_acme_analyst"), join(fx.root, "people/pat-lee/applications/Acme Analyst"));
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("name applications")));
  } finally {
    fx.cleanup();
  }
});

test("application directory needs one record", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/applications/2026-09-03_beta_engineer/posting.md", "---\ntype: posting\nperson: pat-lee\ncompany: Beta\nrole: Engineer\n---\n");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("exactly one application record")));
  } finally {
    fx.cleanup();
  }
});

test("person mismatch fails", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/inbox.md", "---\ntype: inbox\nperson: someone-else\n---\n");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("does not match directory")));
  } finally {
    fx.cleanup();
  }
});

test("missing profile fails", async () => {
  const fx = await validFixture();
  try {
    rmSync(join(fx.root, "people/pat-lee/profile.md"));
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("exactly one profile")));
  } finally {
    fx.cleanup();
  }
});

test("unknown policy fails", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/answers.md", "---\ntype: answers\nperson: pat-lee\n---\n\n### work-auth.sponsorship\n- Answer: No\n- Policy: always\n");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("Policy")));
  } finally {
    fx.cleanup();
  }
});

test("saved entry without answer is a warning", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/answers.md", "---\ntype: answers\nperson: pat-lee\n---\n\n### comp.strategy\n- Answer:\n- Policy: confirm\n");
    const { errors, warnings } = await run(fx.root);
    assert.deepEqual(errors, []);
    assert.ok(warnings.some((w) => w.includes("no answer")));
  } finally {
    fx.cleanup();
  }
});

test("profile apply values", async () => {
  const fx = await validFixture();
  try {
    const profilePath = join(fx.root, "people/pat-lee/profile.md");
    const text = "---\ntype: profile\nperson: pat-lee\nname: Pat Lee\napply: onboarding\n---\n";
    writeFileSync(profilePath, text);
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("apply 'onboarding'")));
  } finally {
    fx.cleanup();
  }
});

test("unknown type fails", async () => {
  const fx = await validFixture();
  try {
    fx.write("shared/thing.md", "---\ntype: mystery\n---\n");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("unknown type")));
  } finally {
    fx.cleanup();
  }
});

// Not ported: the Python suite's test_flat_yaml_fallback_matches_schema. That covered a
// PyYAML-less fallback parser that only existed because PyYAML was an optional dependency; the
// `yaml` npm package is a hard dependency here, so there is no fallback path to test.

// --- New rules the Python checker did not have ---

test("cover letter mismatched company fails", async () => {
  const fx = await validFixture();
  try {
    fx.write(
      "people/pat-lee/applications/2026-09-01_acme_analyst/cover-letter.md",
      "---\ntype: cover-letter\nperson: pat-lee\ncompany: Wrong Co\n---\n\nDear Acme, I would love to join Wrong Co.\n",
    );
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("does not match the application record's")));
  } finally {
    fx.cleanup();
  }
});

test("a cover letter may use the employer's everyday name, set in its frontmatter", async () => {
  const fx = await validFixture();
  try {
    const dir = "people/pat-lee/applications/2026-09-02_amazon-com-services_analyst";
    fx.write(`${dir}/record.md`, RECORD.replace(/company: .*/, 'company: "Amazon.com Services LLC"').replace(/role: .*/, "role: Analyst"));
    fx.write(`${dir}/cover-letter.md`, "---\ntype: cover-letter\nperson: pat-lee\ncompany: Amazon\n---\n\nDear hiring team, I would love to bring my analysis work to Amazon.\n");
    const { errors } = await run(fx.root);
    assert.deepEqual(errors.filter((e) => e.includes(dir)), []);
  } finally {
    fx.cleanup();
  }
});

test("cover letter not mentioning the company fails", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/applications/2026-09-01_acme_analyst/cover-letter.md", "---\ntype: cover-letter\nperson: pat-lee\n---\n\nDear hiring team, I would love this role.\n");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("does not mention")));
  } finally {
    fx.cleanup();
  }
});

test("cover letter repeating an unconfirmed phrase fails", async () => {
  const fx = await validFixture();
  try {
    fx.write(
      "people/pat-lee/resumes/source/facts.yaml",
      "projects:\n  ops:\n    title: Ops\n    bullets:\n      - text: Led a team\n        confirm:\n          - cut ticket handling time by 30%\njobs: {}\n",
    );
    fx.write(
      "people/pat-lee/applications/2026-09-01_acme_analyst/cover-letter.md",
      "---\ntype: cover-letter\nperson: pat-lee\n---\n\nDear Acme, I cut ticket handling time by 30% last year.\n",
    );
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("unconfirmed phrase")));
  } finally {
    fx.cleanup();
  }
});

test("cover letter is fine without a facts.yaml file", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/applications/2026-09-01_acme_analyst/cover-letter.md", "---\ntype: cover-letter\nperson: pat-lee\n---\n\nDear Acme, I would love this role.\n");
    const { errors } = await run(fx.root);
    assert.deepEqual(errors, []);
  } finally {
    fx.cleanup();
  }
});

test("doc-commands flags commands and scripts the docs name but the tools lack", async () => {
  const fx = await validFixture();
  try {
    fx.write("AGENTS.md", "# fixture\n\nRun `./resumes check`, then `./resumes retired-cmd`.\n\n```sh\n./resumes help\nresumes gone-too --flag\n```\n\nOld: `python3 tools/check.py`.\n");
    const { errors } = await run(fx.root);
    assert.ok(errors.some((e) => e.includes("`resumes retired-cmd`")), "an unknown command in prose");
    assert.ok(errors.some((e) => e.includes("`resumes gone-too`")), "an unknown command in a code block");
    assert.ok(errors.some((e) => e.includes("tools/check.py")), "a missing script");
    assert.ok(!errors.some((e) => e.includes("`resumes check`") || e.includes("`resumes help`")), "real commands pass");
  } finally {
    fx.cleanup();
  }
});

test("docs-consistency warns on a type missing from AGENTS.md", async () => {
  const fx = await validFixture();
  try {
    const { warnings } = await run(fx.root);
    // The fixture's AGENTS.md ("# fixture") lists no types at all, so every schema type warns.
    assert.ok(warnings.some((w) => w.includes("profile") && w.includes("AGENTS.md")));
  } finally {
    fx.cleanup();
  }
});

test("a session credentials file is a known type, and check names no password", async () => {
  const fx = await validFixture();
  try {
    fx.write("people/pat-lee/accounts.local.md", "---\ntype: session-credentials\nperson: pat-lee\nemail: jobs@example.com\npassword: correct-horse-battery\n---\n");
    const { errors, warnings } = await run(fx.root);
    assert.deepEqual(errors, []);
    assert.ok(![...errors, ...warnings].some((m) => m.includes("correct-horse-battery")));
  } finally {
    fx.cleanup();
  }
});
