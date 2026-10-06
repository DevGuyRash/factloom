import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture } from "./helpers/fixture.ts";

const CATALOG = `---\ntype: onboarding-catalog\n---\n\n# Onboarding catalog\n\n## Work authorization\n\n### work-auth.sponsorship (core)\n- Ask: Will you need sponsorship?\n- Shape: yes / no\n- Policy: auto\n\n### work-auth.clearance\n- Ask: Clearance?\n- Policy: auto\n\n## Timing\n\n### availability.start (core)\n- Ask: Start date?\n- Policy: auto\n`;

test("catalog parsing, open core questions, session file, and saving", async () => {
  const fx = makeFixture({ "shared/onboarding.md": CATALOG, "people/pat-lee/answers.md": "---\ntype: answers\nperson: pat-lee\n---\n\n### work-auth.sponsorship\n- Answer: No\n- Policy: auto\n- Confirmed: 2026-09-01\n" });
  process.env.RESUMES_ROOT = fx.root;
  try {
    const { loadCatalog, openCoreQuestions, loadAnswers } = await import("../src/lib/catalog.ts");
    const cat = loadCatalog(fx.root);
    assert.deepEqual(cat.map((e) => [e.id, e.core, e.section]), [["work-auth.sponsorship", true, "Work authorization"], ["work-auth.clearance", false, "Work authorization"], ["availability.start", true, "Timing"]]);
    assert.deepEqual(openCoreQuestions("pat-lee", fx.root).map((e) => e.id), ["availability.start"]);
    const cmd = (await import("../src/commands/onboarding.ts")).default;
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(await cmd.run(["answer", "availability.start", "Two", "weeks", "--person", "pat-lee"]), 0);
    const session = loadAnswers(join(fx.root, "people/pat-lee/session.local.md"));
    assert.equal(session.get("availability.start")?.answer, "Two weeks");
    assert.equal(session.get("work-auth.sponsorship")?.answer, "No");
    assert.deepEqual(openCoreQuestions("pat-lee", fx.root), []);
    assert.equal(await cmd.run(["answer", "availability.start", "One", "week", "--save", "--person", "pat-lee"]), 0);
    const saved = loadAnswers(join(fx.root, "people/pat-lee/answers.md"));
    assert.equal(saved.get("availability.start")?.answer, "One week");
    assert.ok(saved.get("availability.start")?.confirmed);
    assert.equal(loadAnswers(join(fx.root, "people/pat-lee/session.local.md")).get("availability.start")?.answer, "One week");
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("onboarding start keeps the last session's answers, unless a saved answer is newer or --fresh starts over", async () => {
  const fx = makeFixture({ "shared/onboarding.md": CATALOG });
  process.env.RESUMES_ROOT = fx.root;
  try {
    const { loadAnswers, openCoreQuestions } = await import("../src/lib/catalog.ts");
    const cmd = (await import("../src/commands/onboarding.ts")).default;
    const sessionFile = join(fx.root, "people/pat-lee/session.local.md");
    const answer = (id: string) => loadAnswers(sessionFile).get(id)?.answer;
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(await cmd.run(["answer", "availability.start", "Immediately", "--person", "pat-lee"]), 0);
    assert.equal(await cmd.run(["answer", "work-auth.sponsorship", "No", "--person", "pat-lee"]), 0);
    // A new session: answers the person gave last time stand until they change them.
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(answer("availability.start"), "Immediately");
    assert.equal(answer("work-auth.sponsorship"), "No");
    assert.deepEqual(openCoreQuestions("pat-lee", fx.root).map((e) => e.id), [], "so onboarding does not ask them again");
    // A saved answer confirmed after that session is newer and wins.
    const fm = readFileSync(sessionFile, "utf8").replace(/^session: .*$/m, "session: 2020-01-01");
    writeFileSync(sessionFile, fm);
    writeFileSync(join(fx.root, "people/pat-lee/answers.md"), "---\ntype: answers\nperson: pat-lee\n---\n\n### availability.start\n- Answer: In two weeks\n- Policy: auto\n- Confirmed: 2026-10-01\n");
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(answer("availability.start"), "In two weeks");
    assert.equal(answer("work-auth.sponsorship"), "No");
    // --fresh starts from the saved answers alone.
    assert.equal(await cmd.run(["start", "--fresh", "--person", "pat-lee"]), 0);
    assert.equal(answer("availability.start"), "In two weeks");
    assert.equal(answer("work-auth.sponsorship"), undefined);
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("notes stay with their answers through onboarding start, answer, and --save, until replaced or cleared", async () => {
  const saved = "---\ntype: answers\nperson: pat-lee\n---\n\n### work-auth.clearance\n- Answer: No\n- Policy: auto\n- Confirmed: 2026-09-01\n- Notes: Yes for Example Corp (held one there)\n  and say so on its forms only\n";
  const fx = makeFixture({ "shared/onboarding.md": CATALOG, "people/pat-lee/answers.md": saved });
  process.env.RESUMES_ROOT = fx.root;
  try {
    const { loadAnswers } = await import("../src/lib/catalog.ts");
    const cmd = (await import("../src/commands/onboarding.ts")).default;
    const session = () => loadAnswers(join(fx.root, "people/pat-lee/session.local.md")).get("work-auth.clearance");
    const kept = () => loadAnswers(join(fx.root, "people/pat-lee/answers.md")).get("work-auth.clearance");
    const NOTE = "Yes for Example Corp (held one there)\n  and say so on its forms only";
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(session()?.notes, NOTE);
    assert.equal(await cmd.run(["answer", "work-auth.clearance", "No", "--save", "--person", "pat-lee"]), 0);
    assert.equal(session()?.notes, NOTE);
    assert.equal(kept()?.notes, NOTE);
    assert.equal(await cmd.run(["answer", "work-auth.clearance", "No", "--notes", "", "--person", "pat-lee"]), 0);
    assert.equal(session()?.notes, undefined);
    assert.equal(kept()?.notes, NOTE);
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("an answer the catalog stores locally is saved only in the git-ignored private file, and still counts as answered", async () => {
  const catalog = `${CATALOG}\n## Identity and contact\n\n### contact.address (core)\n- Ask: Which mailing address?\n- Shape: street, city, state, ZIP\n- Stored: local\n- Policy: confirm\n`;
  const fx = makeFixture({ "shared/onboarding.md": catalog });
  process.env.RESUMES_ROOT = fx.root;
  try {
    const { loadAnswers, openCoreQuestions } = await import("../src/lib/catalog.ts");
    const cmd = (await import("../src/commands/onboarding.ts")).default;
    // Built at run time, so this file holds no address-shaped text for the personal-data scan to flag.
    const address = [1, "Example", "Way,", "Springfield,", "ST", "00000"].join(" ");
    assert.equal(await cmd.run(["answer", "contact.address", address, "--save", "--person", "pat-lee"]), 0);
    assert.ok(!existsSync(join(fx.root, "people/pat-lee/answers.md")) || !readFileSync(join(fx.root, "people/pat-lee/answers.md"), "utf8").includes("Example"));
    const kept = readFileSync(join(fx.root, "people/pat-lee/private.local.md"), "utf8");
    assert.match(kept, /^---\ntype: private\n/);
    assert.equal(loadAnswers(join(fx.root, "people/pat-lee/private.local.md")).get("contact.address")?.answer, address);
    // A fresh session still has it, and it no longer shows as an open question.
    assert.equal(await cmd.run(["start", "--fresh", "--person", "pat-lee"]), 0);
    assert.equal(loadAnswers(join(fx.root, "people/pat-lee/session.local.md")).get("contact.address")?.answer, address);
    assert.ok(!openCoreQuestions("pat-lee", fx.root).some((e) => e.id === "contact.address"));
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("one skill's years take the policy of the catalog's experience.years.<skill> entry", async () => {
  const catalog = `${CATALOG}\n## Experience\n\n### experience.years.<skill>\n- Ask: Derived from dated evidence.\n- Shape: number with basis\n- Policy: auto\n`;
  const fx = makeFixture({ "shared/onboarding.md": catalog });
  process.env.RESUMES_ROOT = fx.root;
  try {
    const { loadAnswers } = await import("../src/lib/catalog.ts");
    const cmd = (await import("../src/commands/onboarding.ts")).default;
    assert.equal(await cmd.run(["answer", "experience.years.python", "3 (derived: two dated jobs)", "--person", "pat-lee"]), 0);
    const session = loadAnswers(join(fx.root, "people/pat-lee/session.local.md"));
    assert.equal(session.get("experience.years.python")?.policy, "auto");
    assert.equal(session.get("experience.years.python")?.answer, "3 (derived: two dated jobs)");
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("inbox add writes the documented entry format", async () => {
  const fx = makeFixture();
  process.env.RESUMES_ROOT = fx.root;
  try {
    const cmd = (await import("../src/commands/inbox.ts")).default;
    assert.equal(await cmd.run(["add", "--person", "pat-lee", "--company", "Acme", "--site", "Greenhouse", "--question", "Are you open to on-call?", "--answer", "held for the person"]), 0);
    const text = readFileSync(join(fx.root, "people/pat-lee/inbox.md"), "utf8");
    assert.match(text, /^type: inbox$/m);
    assert.match(text, /### \d{4}-\d{2}-\d{2} Acme \(Greenhouse\): "Are you open to on-call\?"\n- Answer used: held for the person\n- Decided by: person/);
    assert.ok(existsSync(join(fx.root, "people/pat-lee/inbox.md")));
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("an entry with a default is not asked: start writes the default, and the person's own answer replaces it", async () => {
  const withDefault = (d: string) => `${CATALOG}\n## Mail\n\n### mail.replies (core)\n- Ask: May the agent answer routine replies?\n- Shape: choice\n- Default: ${d}\n- Policy: confirm\n`;
  const fx = makeFixture({ "shared/onboarding.md": withDefault("answer what my answers settle") });
  process.env.RESUMES_ROOT = fx.root;
  const log = console.log;
  const out: string[] = [];
  console.log = (...m: unknown[]) => out.push(m.join(" "));
  try {
    const { loadAnswers, openCoreQuestions, defaultsInEffect } = await import("../src/lib/catalog.ts");
    const cmd = (await import("../src/commands/onboarding.ts")).default;
    const sessionFile = join(fx.root, "people/pat-lee/session.local.md");
    // Not an open question, but named once as what the agent will do.
    assert.ok(!openCoreQuestions("pat-lee", fx.root).some((e) => e.id === "mail.replies"));
    assert.equal(await cmd.run(["--person", "pat-lee"]), 0);
    assert.match(out.join("\n"), /defaults in effect \(1\): not asked[\s\S]*mail\.replies: answer what my answers settle/);
    // Every form and activation reads it from the session's answers.
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(loadAnswers(sessionFile).get("mail.replies")?.answer, "answer what my answers settle");
    assert.equal(loadAnswers(sessionFile).get("mail.replies")?.source, "catalog default");
    // A changed default takes effect next session; it is never carried over as if the person had said it.
    writeFileSync(join(fx.root, "shared/onboarding.md"), withDefault("tell me only"));
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(loadAnswers(sessionFile).get("mail.replies")?.answer, "tell me only");
    // The person's own answer replaces it, and the default is no longer in effect.
    assert.equal(await cmd.run(["answer", "mail.replies", "answer", "and", "book", "--person", "pat-lee"]), 0);
    assert.deepEqual(defaultsInEffect("pat-lee", fx.root).map((e) => e.id), []);
    assert.equal(await cmd.run(["start", "--person", "pat-lee"]), 0);
    assert.equal(loadAnswers(sessionFile).get("mail.replies")?.answer, "answer and book");
  } finally { console.log = log; delete process.env.RESUMES_ROOT; fx.cleanup(); }
});
