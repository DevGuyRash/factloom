import assert from "node:assert";
import test from "node:test";
import { notify } from "../src/lib/notify.ts";
import notifyCmd from "../src/commands/notify.ts";

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

test("notify posts to ntfy when RESUMES_NTFY_URL is set, without touching the real network", async () => {
  const calls: Array<{ url: string; message: string; title?: string }> = [];
  const r = await notify("hello", { title: "Heads up" }, {
    env: { RESUMES_NTFY_URL: "https://ntfy.example/topic" },
    post: (url, message, title) => { calls.push({ url, message, title }); },
  });
  assert.equal(r.via, "ntfy");
  assert.equal(r.dryRun, false);
  assert.deepEqual(calls, [{ url: "https://ntfy.example/topic", message: "hello", title: "Heads up" }]);
});

test("notify falls back to a desktop notifier when no ntfy URL is configured", async () => {
  const r = await notify("hello", {}, { env: {}, sendDesktop: () => true });
  assert.equal(r.via, "notify-send");
});

test("notify prints as a last resort, with no network or exec call", async () => {
  const lines: string[] = [];
  const r = await notify("hello there", {}, { env: {}, sendDesktop: () => false, log: (l) => lines.push(l) });
  assert.equal(r.via, "print");
  assert.deepEqual(lines, ["hello there"]);
});

test("notify --dry-run never calls post or sendDesktop", async () => {
  let called = false;
  const lines: string[] = [];
  const r = await notify("hello", { dryRun: true, title: "T" }, {
    env: { RESUMES_NTFY_URL: "https://ntfy.example/topic" },
    post: () => { called = true; },
    sendDesktop: () => { called = true; return true; },
    log: (l) => lines.push(l),
  });
  assert.equal(r.dryRun, true);
  assert.equal(called, false);
  assert.match(lines[0], /^\[dry run\] would notify via ntfy: T: hello$/);
});

test("notify command dry-run exits 0 without touching network or desktop", async () => {
  const lines = captureLog(() => {});
  const code = await notifyCmd.run(["build", "finished", "--title", "Resumes", "--dry-run"]);
  assert.equal(code, 0);
  assert.equal(lines.length, 0);
});
