// Quick-start onboarding and the minimum fit score: essential questions come first, and `score` checks the person's bar.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import onboardingCommand from "../src/commands/onboarding.ts";
import scoreCommand, { verdict } from "../src/commands/score.ts";
import { loadCatalog, openCoreQuestions } from "../src/lib/catalog.ts";
import { readDoc, writeDoc } from "../src/lib/frontmatter.ts";
import { loadPipelineConfig } from "../src/lib/pipeline-config.ts";
import { minimumScore, parseMinimum } from "../src/lib/scoring.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

const CATALOG = `---\ntype: onboarding-catalog\n---\n\n# Onboarding catalog\n\n## Work authorization\n\n### work-auth.sponsorship (essential)\n- Ask: Will you need sponsorship?\n- Policy: auto\n\n### work-auth.clearance (core)\n- Ask: Clearance?\n- Policy: auto\n\n### work-auth.visa\n- Ask: Visa?\n- Policy: auto\n`;

function capture(fn: () => unknown): Promise<string> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
  return Promise.resolve().then(fn).finally(() => { console.log = log; }).then(() => lines.join("\n"));
}

test("an essential entry is core too, and onboarding lists the open essential questions first", async () => {
  const fx = makeFixture({ "shared/onboarding.md": CATALOG });
  process.env.RESUMES_ROOT = fx.root;
  try {
    assert.deepEqual(loadCatalog(fx.root).map((e) => [e.id, e.core, e.essential]), [["work-auth.sponsorship", true, true], ["work-auth.clearance", true, false], ["work-auth.visa", false, false]]);
    assert.deepEqual(openCoreQuestions("pat-lee", fx.root).map((e) => e.id), ["work-auth.sponsorship", "work-auth.clearance"]);
    const out = await capture(() => onboardingCommand.run(["--person", "pat-lee"]));
    assert.match(out, /open essential questions \(1\): ask these before the first application\n {2}Work authorization\n {4}work-auth\.sponsorship: /);
    assert.match(out, /other open core questions \(1\)[^\n]*\n {2}Work authorization\n {4}work-auth\.clearance: /);
    assert.doesNotMatch(out, /work-auth\.visa/);
  } finally { delete process.env.RESUMES_ROOT; fx.cleanup(); }
});

test("the shipped catalog's essentials settle what to apply for and what nearly every form asks", () => {
  const catalog = loadCatalog(REAL_ROOT);
  const essential = new Set(catalog.filter((e) => e.essential).map((e) => e.id));
  for (const id of ["prefs.min-fit", "work-auth.us-authorized", "work-auth.sponsorship", "prefs.work-arrangement", "prefs.constraints", "employers.avoid", "comp.strategy", "comp.minimum", "availability.start", "consent.required-terms", "experience.years-total", "eeo.gender", "accounts.handling"]) {
    assert.ok(essential.has(id), `${id} is essential`);
  }
  assert.ok(essential.size <= 20, `quick start stays short (${essential.size} essential ids)`);
  assert.ok(catalog.filter((e) => e.core && !e.essential).length > 10, "the rest are still asked, after applying starts");
});

test("the demo person has every essential answer, so a trial needs no onboarding", () => {
  assert.deepEqual(openCoreQuestions("jordan-rivera", `${REAL_ROOT}/examples/demo`).filter((e) => e.essential).map((e) => e.id), []);
});

test("the minimum comes from this session's answer, then the saved one, then the pipeline default", () => {
  const fx = makeFixture();
  try {
    assert.equal(loadPipelineConfig(REAL_ROOT).score.minimum, 65);
    assert.equal(loadPipelineConfig(REAL_ROOT).score.must_haves_minimum, 0.5);
    assert.deepEqual(minimumScore("pat-lee", fx.root), { value: 65, source: "pipeline default" });
    fx.write("custom/pipeline.yaml", "score:\n  minimum: 55\n");
    assert.deepEqual(minimumScore("pat-lee", fx.root), { value: 55, source: "pipeline default" });
    fx.write("people/pat-lee/answers.md", "---\ntype: answers\nperson: pat-lee\n---\n\n### prefs.min-fit\n- Answer: 75, strong matches only\n- Policy: auto\n- Confirmed: 2026-09-01\n");
    assert.deepEqual(minimumScore("pat-lee", fx.root), { value: 75, source: "saved answer" });
    fx.write("people/pat-lee/session.local.md", "---\ntype: session-answers\nperson: pat-lee\nsession: 2026-10-01\n---\n\n### prefs.min-fit\n- Answer: 40\n- Policy: auto\n");
    assert.deepEqual(minimumScore("pat-lee", fx.root), { value: 40, source: "session answer" });
    fx.write("people/pat-lee/session.local.md", "---\ntype: session-answers\nperson: pat-lee\nsession: 2026-10-01\n---\n\n### prefs.min-fit\n- Answer: strong matches\n- Policy: auto\n");
    const unreadable = minimumScore("pat-lee", fx.root);
    assert.equal(unreadable.value, 55, "an answer without a number falls back to the pipeline default, not to an older answer");
    assert.match(unreadable.source, /^pipeline default \(the session answer "strong matches" states no number/);
  } finally { fx.cleanup(); }
});

test("a minimum is read from numbers, fractions, and words for no bar", () => {
  for (const [answer, value] of [["60", 60], ["75, strong matches only", 75], ["0.6", 60], ["150", 100], ["none", 0], ["No minimum", 0], ["anything I qualify for", 0], ["strong matches", null], ["", null]] as const) {
    assert.equal(parseMinimum(answer), value, answer);
  }
});

test("score says whether a posting clears the minimum, and notes a fit map without must-haves", async () => {
  const fx = makeFixture({ "people/pat-lee/answers.md": "---\ntype: answers\nperson: pat-lee\n---\n\n### prefs.min-fit\n- Answer: 60\n- Policy: auto\n- Confirmed: 2026-09-01\n" });
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = fx.root;
  try {
    await appCommand.run(["new", "--company", "Corvid", "--role", "Senior Data Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    const { data, body } = readDoc(`${appDir}/record.md`);
    (data as Record<string, unknown>).fit = { must_haves_met: 0, must_haves_total: 5, pay_ok: true, arrangement_ok: true, location_ok: true, seniority: "stretch", preferred_met: 0, preferred_total: 2 };
    writeDoc(`${appDir}/record.md`, data, body);
    const out = await capture(() => scoreCommand.run([appDir, "--person", "pat-lee"]));
    assert.match(out, /: 42 \(meets 0 of 5 must-haves, under 50%: skip, with that as the reason\)$/);
    const min = { value: 60, source: "pipeline default" };
    assert.equal(verdict(93, min, { must_haves_met: 2, must_haves_total: 2 }, 0.5), "93 (clears the minimum of 60; minimum from the pipeline default)");
    assert.equal(verdict(58, min, { must_haves_met: 2, must_haves_total: 4 }, 0.5), "58 (below the minimum of 60: skip, with the score as the reason; minimum from the pipeline default)");
    assert.match(verdict(65, min, { must_haves_met: 1, must_haves_total: 4 }, 0.5), /meets 1 of 4 must-haves, under 50%: skip/, "a high score does not rescue too few must-haves");
    assert.equal(verdict(100, min, { pay_ok: true }, 0.5), "100 (no verdict: record fit.must_haves_met and fit.must_haves_total, then score again)");
  } finally {
    if (prev === undefined) delete process.env.RESUMES_ROOT; else process.env.RESUMES_ROOT = prev;
    fx.cleanup();
  }
});

test("app skip records the reason and closes the queue item", async () => {
  const fx = makeFixture();
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = fx.root;
  try {
    const queue = (await import("../src/commands/queue.ts")).default;
    await queue.run(["add", "--url", "https://example.com/jobs/1", "--company", "Corvid", "--role", "Senior Data Engineer", "--person", "pat-lee"]);
    await appCommand.run(["new", "--company", "Corvid", "--role", "Senior Data Engineer", "--url", "https://example.com/jobs/1", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;
    assert.equal(await appCommand.run(["skip", appDir, "--reason", "meets 0 of 5 must-haves", "--person", "pat-lee"]), 0);
    const { data, body } = readDoc(`${appDir}/record.md`);
    assert.equal(data.status, "skipped");
    assert.match(body, /skipped — meets 0 of 5 must-haves/);
    const { loadQueue } = await import("../src/lib/queue.ts");
    assert.deepEqual(loadQueue("pat-lee", fx.root).items.map((i) => [i.status, i.outcome]), [["done", "skipped"]]);
  } finally {
    if (prev === undefined) delete process.env.RESUMES_ROOT; else process.env.RESUMES_ROOT = prev;
    fx.cleanup();
  }
});
