import assert from "node:assert";
import test from "node:test";
import { findStories, listStories, matchStories, parseStories } from "../src/lib/stories.ts";
import storiesCmd from "../src/commands/stories.ts";
import { makeFixture } from "./helpers/fixture.ts";

const BODY = `# Stories

### automating-own-workflow

- Competencies: automation, process improvement
- Situation: Northwind's AP work spans Jira and Oracle Fusion.
- Action: Built a browser extension with a Rust/WebAssembly rule engine, tests, and CI to automate it.
- Result: The AP team adopted it.

### large-stakeholder-programs

- Competencies: stakeholder management, communication
- Situation: A statewide program spanned 200+ school districts.
- Action: Served as primary stakeholder contact.
- Result: Requirements and reporting stayed coordinated.
`;

function withRoot<T>(root: string, fn: () => T): T {
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = root;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.RESUMES_ROOT;
    else process.env.RESUMES_ROOT = prev;
  }
}

function captureLog(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

test("parseStories reads id, competencies, and S/A/R fields", () => {
  const stories = parseStories(BODY);
  assert.equal(stories.length, 2);
  assert.equal(stories[0].id, "automating-own-workflow");
  assert.deepEqual(stories[0].competencies, ["automation", "process improvement"]);
  assert.match(stories[0].situation, /Jira and Oracle Fusion/);
  assert.match(stories[0].result, /AP team adopted it/);
});

test("listStories and findStories read a person's stories.md by competency", () => {
  const fx = makeFixture({ "people/pat-lee/stories.md": `---\ntype: stories\nperson: pat-lee\n---\n\n${BODY}` });
  try {
    const all = listStories("pat-lee", fx.root);
    assert.equal(all.length, 2);
    const hits = findStories("pat-lee", "stakeholder", fx.root);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, "large-stakeholder-programs");
    assert.equal(findStories("pat-lee", "nonexistent-competency", fx.root).length, 0);
  } finally {
    fx.cleanup();
  }
});

test("matchStories ranks the story whose words overlap the given text highest", () => {
  const stories = parseStories(BODY);
  const ranked = matchStories(stories, "automate Jira Oracle Fusion with a Rust WebAssembly rule engine", 5);
  assert.equal(ranked[0].id, "automating-own-workflow");
});

test("matchStories returns all stories, capped at the limit, when given no text", () => {
  const stories = parseStories(BODY);
  assert.equal(matchStories(stories, "", 1).length, 1);
  assert.equal(matchStories(stories, "   ", 5).length, 2);
});

test("stories command: list and find", () => {
  const fx = makeFixture({ "people/pat-lee/stories.md": `---\ntype: stories\nperson: pat-lee\n---\n\n${BODY}` });
  try {
    withRoot(fx.root, () => {
      const listLines = captureLog(() => storiesCmd.run(["list", "--person", "pat-lee"]));
      assert.equal(listLines.length, 2);
      const findLines = captureLog(() => storiesCmd.run(["find", "stakeholder", "--person", "pat-lee"]));
      assert.equal(findLines.length, 1);
      assert.match(findLines[0], /large-stakeholder-programs/);
    });
  } finally {
    fx.cleanup();
  }
});
