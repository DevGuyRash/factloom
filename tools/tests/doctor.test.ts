import assert from "node:assert";
import test from "node:test";
import doctorCmd from "../src/commands/doctor.ts";
import { REAL_ROOT } from "./helpers/fixture.ts";

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

function captureLog(fn: () => number): { code: number; lines: string[] } {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    return { code: fn(), lines };
  } finally {
    console.log = orig;
  }
}

test("doctor reports every check and exits 0 on a machine with a current Node", () => {
  const { code, lines } = withRoot(REAL_ROOT, () => captureLog(() => doctorCmd.run([]) as number));
  assert.equal(code, 0, "Node on the test runner satisfies >= 22.18, so doctor should not fail the run");
  for (const name of ["node", "tools/node_modules", "soffice", "pandoc", "pdftotext", "git hooks path", "gh auth status"]) {
    assert.ok(lines.some((l) => l.includes(name)), `expected a check line for ${name}`);
  }
  assert.ok(lines.every((l) => /^\[(OK|MISSING|NOTE|DANGER)\]/.test(l)), "every line has a status");
  assert.ok(!lines.some((l) => l.startsWith("[DANGER]")), "the engine itself never holds real people's data");
});
