import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";
import JSZip from "jszip";
import { buildVariant } from "../src/commands/build-resumes.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";
import { confirmsUsed, factsText, resolveContent, resolveSummary, type Facts, type Variant } from "../src/render/spec.ts";
import { reviewSummary } from "../src/commands/summary.ts";
import { rebuildTailored, tailorApplication } from "../src/commands/tailor.ts";

const factsFile = "people/pat-lee/resumes/source/facts.yaml";
function seed(fx: ReturnType<typeof makeFixture>) {
  fx.write("shared/templates/themes/classic-blue.json", readFileSync(join(REAL_ROOT, "shared/templates/themes/classic-blue.json"), "utf8"));
  fx.write(factsFile, YAML.stringify({ person: "pat-lee", name: "Pat Lee", contact: [{ text: "pat@example.com" }],
    skills: { data: { label: "Data", items: "SQL", sources: ["synthetic-source-1"] } }, jobs: {}, projects: {}, lines: {},
    summaries: { general: { channels: {
      resume: { text: "Data analyst who builds SQL reports.", fact_refs: ["skills.data"] },
      web: { text: "I turn data into useful SQL reports for teams.", fact_refs: ["skills.data"] },
    } } },
  }));
  fx.write("people/pat-lee/resumes/source/variants/general.yaml", YAML.stringify({ variant: "general", theme: "classic-blue", headline: "Data Analyst", output: "Pat_Lee_Resume", sections: [{ title: "Summary", summary: "general" }] }));
  fx.write("people/pat-lee/resumes/active/general/guide.md", "---\ntype: resume-guide\nperson: pat-lee\nstatus: ready\nreview: []\n---\nGuide.\n");
}
function cli(root: string, ...args: string[]) {
  return execFileSync(process.execPath, [join(REAL_ROOT, "tools/src/cli.ts"), "summary", ...args, "--person", "pat-lee", "--summary", "general", "--channel", "web"], { env: { ...process.env, RESUMES_ROOT: root }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("named summaries build resume text, explicitly review web text and invalidate changed support end to end", async () => {
  const fx = makeFixture();
  try {
    seed(fx);
    const active = join(fx.root, "people/pat-lee/resumes/active/general");
    const files = await buildVariant("pat-lee", "general", active, fx.root);
    const zip = await JSZip.loadAsync(readFileSync(files.find(p => p.endsWith(".docx"))!));
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.match(xml, /Data analyst who builds SQL reports\./);
    assert.doesNotMatch(xml, /I turn data/);
    assert.equal(readDoc(join(active, "guide.md")).data.status, "needs-review");
    assert.throws(() => cli(fx.root, "show"), /review/);
    const inspected = JSON.parse(cli(fx.root, "inspect"));
    assert.equal(inspected.review_status, "missing");
    assert.deepEqual(inspected.holds, []);
    const before = readFileSync(join(fx.root, factsFile), "utf8");
    assert.throws(() => cli(fx.root, "review", "--expected", "wrong"), /digest/);
    assert.equal(readFileSync(join(fx.root, factsFile), "utf8"), before);
    cli(fx.root, "review", "--expected", inspected.digest);
    const output = JSON.parse(cli(fx.root, "show", "--format", "json"));
    assert.equal(output.text, "I turn data into useful SQL reports for teams.");
    assert.equal(output.review_status, "current");
    assert.equal(output.preview, false);
    assert.equal(cli(fx.root, "show", "--format", "json"), cli(fx.root, "show", "--format", "json"));
    assert.equal(cli(fx.root, "show"), output.text + "\n");
    const changed = YAML.parse(readFileSync(join(fx.root, factsFile), "utf8"));
    changed.skills.data.items = "SQL and Python";
    writeFileSync(join(fx.root, factsFile), YAML.stringify(changed));
    assert.throws(() => cli(fx.root, "show"), /review/);
    const preview = JSON.parse(cli(fx.root, "show", "--format", "json", "--allow-unreviewed"));
    assert.equal(preview.preview, true);
    assert.equal(preview.review_status, "stale");
    assert.notEqual(preview.digest, output.digest);
  } finally { fx.cleanup(); }
});

test("review binds channel, exact wording, ordered supporting facts and attribution without self-evidence", () => {
  const fx = makeFixture();
  try {
    seed(fx);
    const facts = YAML.parse(readFileSync(join(fx.root, factsFile), "utf8")) as Facts;
    facts.lines.degree = { left: "B.S. Statistics", sources: ["synthetic-degree"] };
    const copy = facts.summaries!.general.channels.resume;
    copy.fact_refs.push("lines.degree");
    const digest = resolveSummary(facts, "general").digest;
    copy.reviewed = digest;
    assert.equal(resolveSummary(facts, "general").review_status, "current");
    assert.doesNotMatch(factsText(facts), /Data analyst who/);
    copy.fact_refs.reverse();
    assert.equal(resolveSummary(facts, "general").review_status, "stale");
    copy.fact_refs.reverse();
    facts.skills.data.sources = ["different-source"];
    assert.notEqual(resolveSummary(facts, "general").digest, digest);
    facts.skills.data.sources = ["synthetic-source-1"];
    copy.text += " ";
    assert.notEqual(resolveSummary(facts, "general").digest, digest);
    copy.text = copy.text.trim();
    facts.summaries!.general.channels.profile = { ...copy };
    assert.equal(resolveSummary(facts, "general", "profile").review_status, "stale");
    facts.jobs.work = { title: "Analyst | Employer A", bullets: [{ text: "Built SQL reports.", sources: ["role-record"] }] };
    copy.fact_refs = ["jobs.work.bullets.0"];
    const roleDigest = resolveSummary(facts, "general").digest;
    facts.jobs.work.title = "Analyst | Employer B";
    assert.notEqual(resolveSummary(facts, "general").digest, roleDigest, "support attribution includes the owning role, not just orphaned bullet text");
    const identityDigest = resolveSummary(facts, "general").digest;
    facts.mode = "synthetic_research";
    assert.notEqual(resolveSummary(facts, "general").digest, identityDigest);
    const syntheticDigest = resolveSummary(facts, "general").digest;
    facts.batch_id = "synthetic-batch-a";
    assert.notEqual(resolveSummary(facts, "general").digest, syntheticDigest);
  } finally { fx.cleanup(); }
});

test("summary shape rejects missing, empty, duplicate, circular and ambiguous inputs without fallback", () => {
  const fx = makeFixture();
  try {
    seed(fx);
    const original = YAML.parse(readFileSync(join(fx.root, factsFile), "utf8")) as Facts;
    assert.throws(() => resolveSummary(original, "missing"), /no summary/);
    assert.throws(() => resolveSummary(original, "general", "missing"), /no channel/);
    for (const change of [
      { text: " " }, { fact_refs: [] }, { fact_refs: ["skills.data", "skills.data"] },
      { fact_refs: ["summaries.general"] }, { fact_refs: ["jobs.missing.bullets.0"] },
      { fact_refs: "skills.data" }, { confirm: "pending" }, { reviewed: true },
    ]) {
      const facts = structuredClone(original);
      Object.assign(facts.summaries!.general.channels.resume, change);
      assert.throws(() => resolveSummary(facts, "general"));
    }
    const base = { variant: "general", theme: "classic-blue", headline: "Data Analyst", output: "resume" };
    assert.throws(() => resolveContent(original, { ...base, sections: [{ title: "Summary", summary: "general", paragraph: "bypass" }] } as Variant), /exactly one/);
    const legacy = { ...base, sections: [{ title: "Summary", paragraph: "Legacy wording." }] };
    assert.deepEqual(resolveContent(original, legacy).sections, [{ title: "Summary", paragraph: "Legacy wording." }]);
    assert.deepEqual(confirmsUsed(original, legacy), []);
  } finally { fx.cleanup(); }
});

test("source holds cannot be reviewed away and unused channel holds do not contaminate resume", () => {
  const fx = makeFixture();
  try {
    seed(fx);
    const path = join(fx.root, factsFile);
    const facts = YAML.parse(readFileSync(path, "utf8")) as Facts;
    facts.jobs.work = { title: "Analyst", bullets: [{ text: "Built SQL reports", confirm: ["Confirm ownership"] }] };
    facts.summaries!.general.channels.web.fact_refs = ["jobs.work.bullets.0"];
    writeFileSync(path, YAML.stringify(facts));
    const held = resolveSummary(facts, "general", "web");
    const before = readFileSync(path, "utf8");
    assert.equal(held.holds.length, 1);
    assert.throws(() => reviewSummary("pat-lee", "general", "web", held.digest, fx.root), /evidence holds/);
    assert.equal(readFileSync(path, "utf8"), before);
    writeFileSync(`${path}.summary-review.lock`, "another review");
    assert.throws(() => reviewSummary("pat-lee", "general", "resume", resolveSummary(facts, "general").digest, fx.root), /EEXIST/);
    assert.equal(readFileSync(path, "utf8"), before);
    assert.equal(readFileSync(`${path}.summary-review.lock`, "utf8"), "another review");
    rmSync(`${path}.summary-review.lock`);
    const resume = resolveSummary(facts, "general");
    reviewSummary("pat-lee", "general", "resume", resume.digest, fx.root);
    const reviewed = YAML.parse(readFileSync(path, "utf8")) as Facts;
    const variant = YAML.parse(readFileSync(join(fx.root, "people/pat-lee/resumes/source/variants/general.yaml"), "utf8")) as Variant;
    assert.deepEqual(confirmsUsed(reviewed, variant), []);
    reviewed.summaries!.general.channels.resume.confirm = ["Check scope"];
    assert.match(confirmsUsed(reviewed, variant).join(" "), /Check scope/);
    assert.equal(resolveSummary(reviewed, "general").review_status, "stale");
  } finally { fx.cleanup(); }
});

test("both tailoring paths refuse stale summary review and capture reviewed source in the build manifest", async () => {
  const fx = makeFixture();
  try {
    seed(fx);
    const rel = "people/pat-lee/applications/2026-10-01_acme_analyst";
    fx.write(`${rel}/record.md`, "---\ntype: application\nperson: pat-lee\ncompany: Acme\nrole: Analyst\nstatus: drafted\nresume: general\n---\n");
    fx.write(`${rel}/posting.md`, "---\ntype: posting\nperson: pat-lee\ncompany: Acme\nrole: Analyst\n---\nSQL reports.\n");
    const dir = join(fx.root, rel);
    await assert.rejects(tailorApplication(dir, {}, fx.root), /Review summary/);
    const facts = YAML.parse(readFileSync(join(fx.root, factsFile), "utf8")) as Facts;
    reviewSummary("pat-lee", "general", "resume", resolveSummary(facts, "general").digest, fx.root);
    await tailorApplication(dir, {}, fx.root);
    // Source capture must include channel prose and its review, not a mutable external dependency.
    const files = (await import("node:fs")).readdirSync(dir);
    const manifest = files.filter(p => p.endsWith(".json")).map(p => readFileSync(join(dir, p), "utf8")).join("\n");
    assert.match(manifest, /Data analyst who builds SQL reports/);
    assert.match(manifest, /reviewed/);
    const changed = YAML.parse(readFileSync(join(fx.root, factsFile), "utf8"));
    changed.summaries.general.channels.resume.text = "Changed text requires fresh review.";
    writeFileSync(join(fx.root, factsFile), YAML.stringify(changed));
    await assert.rejects(rebuildTailored(dir, {}, fx.root), /Review summary/);
    const captured = files.filter(p => p.endsWith(".json")).map(p => readFileSync(join(dir, p), "utf8")).join("\n");
    assert.equal(captured, manifest, "failed stale rebuild does not rewrite captured source");
    const preview = await rebuildTailored(dir, { allowUnconfirmed: true }, fx.root);
    assert.ok(preview.files.every(p => p.includes("PREVIEW_unconfirmed")));
  } finally { fx.cleanup(); }
});
