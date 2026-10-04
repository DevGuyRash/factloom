// The bookkeeping around one posting, as an agent runs it through a long unattended run: one command per outcome,
// with the run log, queue, and status kept in step, and nothing lost between a final click and its record.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import app from "../src/commands/app.ts";
import onboarding from "../src/commands/onboarding.ts";
import queue from "../src/commands/queue.ts";
import sitenote from "../src/commands/sitenote.ts";
import status from "../src/commands/status.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { makeFixture } from "./helpers/fixture.ts";

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

async function output(fn: () => unknown): Promise<string> {
  const lines: string[] = [];
  const log = console.log, err = console.error;
  console.log = (...m: unknown[]) => lines.push(m.join(" "));
  console.error = (...m: unknown[]) => lines.push(m.join(" "));
  try {
    await fn();
  } finally {
    console.log = log;
    console.error = err;
  }
  return lines.join("\n");
}

const runLog = (root: string) => {
  const dir = `${root}/people/pat-lee/runs`;
  const files = existsSync(dir) ? readdirSync(dir).sort() : [];
  return files.length ? readDoc<{ counts: Record<string, number> }>(`${dir}/${files[files.length - 1]}`) : null;
};

test(
  "app new takes the posting text and details; submitting marks the click until submit records it, with proof and a run-log line",
  withFixture({}, async (fx) => {
    writeFileSync(`${fx.root}/posting.txt`, "Senior Analyst\nRemote, contract, $60-$70 an hour.\n");
    const made = await output(() =>
      app.run(["new", "--company", "Acme", "--role", "Senior Analyst", "--posting-file", `${fx.root}/posting.txt`, "--location", "Remote (US)", "--arrangement", "remote", "--pay-min", "60", "--pay-max", "70", "--pay-period", "hour", "--posted", "2026-10-01", "--person", "pat-lee"]),
    );
    const dir = `${fx.root}/${made.trim()}`;
    const posting = readDoc(`${dir}/posting.md`);
    assert.deepEqual([posting.data.location, posting.data.arrangement, posting.data.pay_min, posting.data.pay_max, posting.data.pay_period, posting.data.posted], ["Remote (US)", "remote", 60, 70, "hour", "2026-10-01"]);
    assert.match(posting.body, /Remote, contract, \$60-\$70 an hour\./);

    // A short reference finds the application.
    await app.run(["submitting", "acme_senior", "--person", "pat-lee"]);
    assert.match(await output(() => status.run(["--person", "pat-lee"])), /SUBMIT CLICKED, NOT RECORDED: .*Acme — Senior Analyst.*never send it again/);

    writeFileSync(`${fx.root}/confirm.png`, "png");
    assert.equal(await app.run(["submit", "acme_senior", "--confirmation", "CONF-9", "--proof", `${fx.root}/confirm.png`, "--person", "pat-lee"]), 0);
    const record = readDoc(`${dir}/record.md`).data;
    assert.equal(record.submit_clicked, undefined);
    assert.deepEqual([record.status, record.confirmation, record.proof], ["submitted", "CONF-9", "confirmation.png"]);
    assert.ok(existsSync(`${dir}/confirmation.png`));
    assert.doesNotMatch(await output(() => status.run(["--person", "pat-lee"])), /SUBMIT CLICKED/);
    assert.equal(runLog(fx.root)!.data.counts.submitted, 1);
    assert.match(runLog(fx.root)!.body, /\[applied\] Acme — Senior Analyst \(CONF-9\)/);

    // A step after sending (an assessment) keeps it submitted and shows it as pending.
    await app.run(["hold", "acme_senior", "--reason", "employer assessment by email", "--person", "pat-lee"]);
    assert.equal(readDoc(`${dir}/record.md`).data.status, "submitted");
    assert.match(await output(() => status.run(["--person", "pat-lee"])), /sent, with a step pending: 1\n {2}- .*employer assessment by email/);
    assert.throws(() => app.run(["submit", "nothing-like-it", "--person", "pat-lee"]), /no applications match nothing-like-it; nearest: .*acme_senior-analyst/);
  }),
);

test(
  "holds carry a kind and the answer they wait on; status groups them, and the answer names the holds it frees",
  withFixture({ "shared/onboarding.md": "---\ntype: onboarding-catalog\n---\n\n# Onboarding catalog\n\n## Background\n\n### background.drug-screen (essential)\n- Ask: Willing to take a drug test?\n- Seen as: \"Are you willing to take a drug test?\"\n- Shape: yes / no\n- Policy: auto\n" }, async () => {
    await app.run(["new", "--company", "Beta", "--role", "Engineer", "--person", "pat-lee"]);
    await app.run(["new", "--company", "Gamma", "--role", "Engineer", "--person", "pat-lee"]);
    await app.run(["hold", "beta_engineer", "--reason", "asks about drug testing", "--kind", "answer", "--waits", "background.drug-screen", "--person", "pat-lee"]);
    await app.run(["hold", "gamma_engineer", "--reason", "new account needs a password", "--kind", "account", "--person", "pat-lee"]);
    assert.throws(() => app.run(["hold", "gamma_engineer", "--reason", "x", "--kind", "weather", "--person", "pat-lee"]), /--kind is one of/);
    const s = await output(() => status.run(["--person", "pat-lee"]));
    assert.match(s, /held: 2\n {2}answer \(1\):\n {2}- .*Beta — Engineer.*\[waits on background\.drug-screen\]\n {2}account \(1\):\n {2}- .*Gamma/);
    assert.match(await output(() => onboarding.run(["find", "Are you willing to submit to a drug test?", "--person", "pat-lee"])), /^background\.drug-screen \(auto, match/);
    const answered = await output(() => onboarding.run(["answer", "background.drug-screen", "Yes", "--person", "pat-lee"]));
    assert.match(answered, /held applications waiting on background\.drug-screen: .*beta_engineer/);
    assert.doesNotMatch(answered, /gamma/);
  }),
);

test(
  "queue skip rules a posting out without an application directory, and queue add will not take it again",
  withFixture({}, async (fx) => {
    const url = "https://www.linkedin.com/jobs/view/123456/?trackingId=abc";
    assert.equal(await queue.run(["skip", "--url", url, "--company", "Delta", "--role", "Analyst", "--reason", "W-2 only", "--person", "pat-lee"]), 0);
    assert.ok(!existsSync(`${fx.root}/people/pat-lee/applications`));
    assert.match(await output(() => queue.run(["add", "--url", "https://linkedin.com/jobs/view/123456", "--person", "pat-lee"])), /not added: already queued \(done, skipped\)/);
    assert.equal(runLog(fx.root)!.data.counts.skipped, 1);
  }),
);

test(
  "a record whose YAML no longer parses is reported by name instead of vanishing",
  withFixture({}, async (fx) => {
    const made = await output(() => app.run(["new", "--company", "Epsilon", "--role", "Analyst", "--person", "pat-lee"]));
    const path = `${fx.root}/${made.trim()}/record.md`;
    writeFileSync(path, readFileSync(path, "utf8").replace("resume:", "resume: a\nresume: b"));
    assert.match(await output(() => status.run(["--person", "pat-lee"])), /unreadable record: .*epsilon_analyst: /);
    assert.throws(() => app.run(["skip", "epsilon", "--reason", "x", "--person", "pat-lee"]), /does not parse .*duplicated key/);
  }),
);

test(
  "sitenote adds a dated line under the site's heading, and reads back the engine's notes and this repository's",
  withFixture({ "shared/site-notes.md": "---\ntype: site-notes\n---\n\n# Site notes\n\n## ExampleBoard\n- 2026-09-01: Cards show pay.\n" }, async (fx) => {
    await sitenote.run(["ExampleBoard", "The Replace button opens no file chooser; set the hidden input instead."]);
    await sitenote.run(["exampleboard", "Search results are newest first by default."]);
    await sitenote.run(["OtherATS", "Asks for an account before the form."]);
    const custom = readFileSync(`${fx.root}/custom/site-notes.md`, "utf8");
    assert.match(custom, /^---\ntype: site-notes\n---/);
    assert.match(custom, /## ExampleBoard\n- \d{4}-\d{2}-\d{2}: The Replace button.*\n- \d{4}-\d{2}-\d{2}: Search results are newest first by default\.\n\n## OtherATS\n- \d{4}-\d{2}-\d{2}: Asks for an account/);
    const read = await output(() => sitenote.run(["exampleboard"]));
    assert.match(read, /shared\/site-notes\.md:\n## ExampleBoard\n- 2026-09-01: Cards show pay\.[\s\S]*custom\/site-notes\.md:\n## ExampleBoard/);
  }),
);
