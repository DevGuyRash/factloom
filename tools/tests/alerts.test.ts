import assert from "node:assert";
import test from "node:test";
import { extractPostings } from "../src/lib/alerts.ts";
import alertsCmd from "../src/commands/alerts.ts";
import { loadQueue } from "../src/lib/queue.ts";
import { makeFixture } from "./helpers/fixture.ts";

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

const DIGEST = `New jobs for you:\n\nAI Engineer at Acme Corp\nhttps://www.linkedin.com/jobs/view/4123456789/?utm_source=email\n\nSoftware Engineer - Zeta Co\nhttps://zeta.greenhouse.io/jobs/555666\n`;

test("extractPostings finds LinkedIn and Greenhouse links and pairs company/role from the same line", () => {
  const found = extractPostings(DIGEST);
  assert.equal(found.length, 2);
  const li = found.find((f) => f.source === "linkedin");
  assert.ok(li);
  assert.equal(li?.url, "https://www.linkedin.com/jobs/view/4123456789/?utm_source=email");
  assert.equal(li?.role, "AI Engineer");
  assert.equal(li?.company, "Acme Corp");
  const gh = found.find((f) => f.source === "greenhouse");
  assert.equal(gh?.company, "Software Engineer");
});

test("extractPostings deduplicates repeated URLs", () => {
  const found = extractPostings("dup: https://jobs.lever.co/acme/123 and again https://jobs.lever.co/acme/123");
  assert.equal(found.length, 1);
});

test("alerts command enqueues found postings, and --dry-run leaves the queue untouched", () => {
  const fx = makeFixture();
  const file = fx.write("job-alert.txt", DIGEST);
  try {
    withRoot(fx.root, () => {
      const dryLines = captureLog(() => alertsCmd.run([file, "--person", "pat-lee", "--dry-run"]));
      assert.ok(dryLines.every((l) => l.startsWith("[dry run]")));
      assert.equal(loadQueue("pat-lee", fx.root).items.length, 0);

      const liveLines = captureLog(() => alertsCmd.run([file, "--person", "pat-lee"]));
      assert.ok(liveLines.some((l) => l.startsWith("queued")));
      const { items } = loadQueue("pat-lee", fx.root);
      assert.equal(items.length, 2);

      const againLines = captureLog(() => alertsCmd.run([file, "--person", "pat-lee"]));
      assert.ok(againLines.every((l) => l.startsWith("skipped")));
    });
  } finally {
    fx.cleanup();
  }
});
