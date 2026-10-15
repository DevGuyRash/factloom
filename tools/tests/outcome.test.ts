import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import command from "../src/commands/outcome.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { applicationRecordErrors } from "../src/lib/application-history.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

function withFixture(files: Record<string, string>, fn: (fx: ReturnType<typeof makeFixture>) => Promise<void> | void) {
  return async () => {
    const fx = makeFixture(files);
    const prev = process.env.RESUMES_ROOT;
    process.env.RESUMES_ROOT = fx.root;
    try {
      await fn(fx);
    } finally {
      if (prev === undefined) delete process.env.RESUMES_ROOT;
      else process.env.RESUMES_ROOT = prev;
      fx.cleanup();
    }
  };
}

test(
  "outcome updates status + updated and appends a dated history line; rejects an unknown status",
  withFixture({}, async (fx) => {
    await appCommand.run(["new", "--company", "Acme", "--role", "Engineer", "--person", "pat-lee"]);
    const dir = `${fx.root}/people/pat-lee/applications`;
    const appDir = `${dir}/${readdirSync(dir)[0]}`;

    const code = await command.run([appDir, "interviewing", "--note", "phone screen Tuesday", "--person", "pat-lee"]);
    assert.equal(code, 0);
    const { data, body } = readDoc(`${appDir}/record.md`);
    assert.equal(data.status, "interviewing");
    assert.match(body, /phone screen Tuesday/);

    assert.throws(() => command.run([appDir, "not-a-status", "--person", "pat-lee"]), /status must be one of/);
  }),
);

// The public CLI must hand feedback to the existing reconciliation workflow without rewriting evidence.
function cli(root: string, args: string[], expected = 0): string {
  const result = spawnSync(process.execPath, [join(REAL_ROOT, "tools/src/cli.ts"), ...args, "--person", "pat-lee"], {
    cwd: root, env: { ...process.env, RESUMES_ROOT: root }, encoding: "utf8",
  });
  assert.equal(result.status, expected, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}

test("CLI generic rejection preserves cause unknown and permits no resume change", withFixture({
  "people/pat-lee/resumes/source/facts.yaml": "person: pat-lee\nexperience: []\n",
}, (fx) => {
  const dir = cli(fx.root, ["app", "new", "--company", "Example Works", "--role", "Engineer"]).trim();
  const factsPath = join(fx.root, "people/pat-lee/resumes/source/facts.yaml");
  const before = readFileSync(factsPath, "utf8");
  const output = cli(fx.root, ["outcome", dir, "rejected", "--on", "2026-10-01", "--note", "We are moving forward with other candidates."]);
  const { data } = readDoc(join(fx.root, dir, "record.md"));
  const events = data.events as Record<string, unknown>[];
  assert.equal(data.status, "rejected");
  assert.deepEqual(events.at(-1)?.feedback, { kind: "generic", cause: "unknown", reconciliation: "no-change-required" });
  assert.match(output, /cause unknown/i);
  assert.match(output, /no resume change required/i);
  assert.equal(readFileSync(factsPath, "utf8"), before);
  assert.equal(events.at(-1)?.note, "We are moving forward with other candidates.");
}));

test("CLI visibility feedback appends a bounded source-evidence recovery handoff after an earlier rejection", withFixture({
  "people/pat-lee/resumes/source/facts.yaml": "person: pat-lee\nexperience: []\n",
  "people/pat-lee/notes/confirmed.md": "---\ntype: notes\nperson: pat-lee\n---\nImplemented production API integrations.\n",
}, (fx) => {
  const dir = cli(fx.root, ["app", "new", "--company", "Example Works", "--role", "Engineer"]).trim();
  cli(fx.root, ["outcome", dir, "rejected", "--on", "2026-10-01"]);
  const recordPath = join(fx.root, dir, "record.md");
  const firstEvents = readDoc(recordPath).data.events as Record<string, unknown>[];
  const factsPath = join(fx.root, "people/pat-lee/resumes/source/facts.yaml");
  const factsBefore = readFileSync(factsPath, "utf8");
  const text = "I could not find your production API integration experience in the resume.";
  const source = "message:employer-42 received 2026-10-03";
  const evidenceRef = "people/pat-lee/notes/confirmed.md#api-integrations";
  const output = cli(fx.root, ["outcome", dir, "rejected", "--on", "2026-10-03", "--feedback", "visibility", "--feedback-text", text, "--source", source, "--evidence-ref", evidenceRef]);
  const { data, body } = readDoc(recordPath);
  const events = data.events as Record<string, unknown>[];
  assert.deepEqual(events.slice(0, firstEvents.length), firstEvents, "later feedback cannot rewrite prior outcome evidence");
  assert.deepEqual(events.at(-1)?.feedback, {
    kind: "visibility", text, source, evidence_refs: [evidenceRef], cause: "unknown", reconciliation: "recover-supported-evidence",
  });
  assert.equal(events.at(-1)?.on, "2026-10-03");
  assert.match(output, /resume-reconciliation/);
  assert.match(output, /original evidence/i);
  assert.match(output, /narrowest/i);
  assert.match(body, /message:employer-42/);
  assert.equal(readFileSync(factsPath, "utf8"), factsBefore, "outcome intake never rewrites source facts");
}));

test("CLI rejects incomplete feedback before changing the application record", withFixture({}, (fx) => {
  const dir = cli(fx.root, ["app", "new", "--company", "Example Works", "--role", "Engineer"]).trim();
  const path = join(fx.root, dir, "record.md");
  const before = readFileSync(path, "utf8");
  for (const flags of [
    ["--feedback", "visibility"],
    ["--feedback", "visibility", "--feedback-text", "API experience not visible"],
    ["--feedback-text", "We rejected you"],
    ["--feedback", "unsupported"],
    ["--source"],
  ]) {
    cli(fx.root, ["outcome", dir, "rejected", ...flags], 1);
    assert.equal(readFileSync(path, "utf8"), before);
  }
}));

test("persisted outcome feedback validates its meaning while old events stay compatible", () => {
  const event = { kind: "rejected", on: "2026-10-01", recorded_at: "2026-10-02T09:00:00Z" };
  assert.deepEqual(applicationRecordErrors({ events: [event] }), []);
  const generic = { kind: "generic", cause: "unknown", reconciliation: "no-change-required" };
  assert.deepEqual(applicationRecordErrors({ events: [{ ...event, feedback: generic }] }), []);
  const visibility = { kind: "visibility", cause: "unknown", reconciliation: "recover-supported-evidence", text: "API experience was not visible", source: "message:employer-42", evidence_refs: ["notes/confirmed.md#api"] };
  assert.deepEqual(applicationRecordErrors({ events: [{ ...event, feedback: visibility }] }), []);
  for (const feedback of [
    "keyword failure", [],
    { ...generic, kind: "assumed-cause" },
    { ...generic, cause: "missing-keywords" },
    { ...generic, reconciliation: "rewrite-all" },
    { ...generic, reconciliation: "recover-supported-evidence" },
    { ...visibility, text: undefined },
    { ...visibility, source: " " },
    { ...visibility, evidence_refs: "notes/confirmed.md" },
    { ...visibility, evidence_refs: ["notes/confirmed.md", 42] },
    { ...visibility, evidence_refs: [""] },
    { ...generic, text: "No longer considered", source: undefined },
  ]) {
    assert.ok(applicationRecordErrors({ events: [{ ...event, feedback }] }).some((error) => error.startsWith("events[0].feedback")), `malformed feedback must be reported: ${JSON.stringify(feedback)}`);
  }
});
