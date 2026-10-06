// The automation prompt: a schedule runs the repository's own text, filled from the person's profile.
import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/templates.ts";
import { makeFixture } from "./helpers/fixture.ts";

async function render(root: string, args: string[]): Promise<string> {
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = root;
  const write = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true; }) as typeof process.stdout.write;
  try {
    assert.equal(await command.run(args), 0);
  } finally {
    process.stdout.write = write;
    if (prev === undefined) delete process.env.RESUMES_ROOT;
    else process.env.RESUMES_ROOT = prev;
  }
  return out;
}

const PROFILE = "---\ntype: profile\nperson: pat-lee\nname: Pat Lee\napply: enabled\n---\n\n# Pat Lee\n\n## Standing instruction\n\n<!-- The person's own words on how autonomously to apply for them. -->\n\nPat, 2026-10-01:\n\n- \"Apply on your own until I say stop. Pre-approved: uploading my resume and entering my contact details on application forms.\"\n\n## Search focus\n\n- Analyst roles.\n";

test("the automation prompt points to the skill and carries the person's own words", async () => {
  const fx = makeFixture({ "people/pat-lee/profile.md": PROFILE });
  try {
    const text = await render(fx.root, ["automation-prompt", "--person", "pat-lee"]);
    assert.match(text, /^Continue Pat Lee's job applications in .*resumes-fixture-[^,]*, following its AGENTS\.md and its job-application skill/);
    assert.match(text, /render this prompt with `\.\/resumes template automation-prompt --person pat-lee`/);
    assert.match(text, /lasts until Pat Lee says stop/);
    assert.match(text, /Pre-approved: uploading my resume and entering my contact details on application forms\./);
    assert.doesNotMatch(text, /<!--|Search focus|\{\{/);
  } finally {
    fx.cleanup();
  }
});

test("without a standing instruction the prompt says to record one; an override wins", async () => {
  const fx = makeFixture();
  try {
    assert.match(await render(fx.root, ["automation-prompt", "--person", "pat-lee"]), /None recorded yet\. Record it in the profile in Pat Lee's own words/);
    fx.write("custom/templates/documents/automation-prompt.md.hbs", "Keep going for {{name}} in {{repo}}.\n");
    assert.equal(await render(fx.root, ["automation-prompt", "--person", "pat-lee"]), `Keep going for Pat Lee in ${fx.root}.\n`);
  } finally {
    fx.cleanup();
  }
});
