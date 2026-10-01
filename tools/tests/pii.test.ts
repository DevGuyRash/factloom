// Unit tests for the personal-data guard's detectors (tools/src/lib/pii.ts) and an end-to-end
// check that `resumes pii` flags real findings while masking them in its output.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { globMatch, isAllowed, mask, scanFile, scanLine } from "../src/lib/pii.ts";

test("detects a US SSN", () => {
  const hits = scanLine("SSN: 219-09-9999 on file");
  assert.ok(hits.some((h) => h.kind === "ssn" && h.match === "219-09-9999"));
});

test("does not flag an obviously-not-an-SSN number", () => {
  // 000-xx-xxxx is never issued.
  const hits = scanLine("code 000-12-3456");
  assert.ok(!hits.some((h) => h.kind === "ssn"));
});

test("detects a birth date label", () => {
  const hits = scanLine("Date of birth: 1990-05-02");
  assert.ok(hits.some((h) => h.kind === "birth-date"));
});

test("detects a Luhn-valid card number and rejects a Luhn-invalid one", () => {
  const valid = scanLine("card 4111 1111 1111 1111 on file");
  assert.ok(valid.some((h) => h.kind === "card-number"));
  const invalid = scanLine("tracking number 1234 5678 9012 3456");
  assert.ok(!invalid.some((h) => h.kind === "card-number"));
});

test("detects common API-key/token shapes", () => {
  assert.ok(scanLine("key=sk-abcdefghijklmnop").some((h) => h.kind === "api-key"));
  assert.ok(scanLine("token ghp_abcdefghijklmnopqrstuvwx").some((h) => h.kind === "api-key"));
  assert.ok(scanLine("AKIAABCDEFGHIJKLMNOP").some((h) => h.kind === "api-key"));
  assert.ok(scanLine("-----BEGIN RSA PRIVATE KEY-----").some((h) => h.kind === "api-key"));
});

test("detects a street address", () => {
  const hits = scanLine("Mail to 123 Main Street, Phoenix");
  assert.ok(hits.some((h) => h.kind === "street-address"));
});

test("docx layout numbers are not read as a street address", () => {
  assert.ok(!scanLine("316470    363040                                St.").some((h) => h.kind === "street-address"));
  assert.ok(scanLine("Office at 1600 W. Example Ave. in Phoenix").some((h) => h.kind === "street-address"));
});

test("mask never reveals the full matched value", () => {
  const secret = "sk-abcdefghijklmnop";
  const masked = mask(secret);
  assert.notEqual(masked, secret);
  assert.ok(!masked.includes(secret.slice(2, -1)));
  assert.equal(masked.length, secret.length);
});

test("glob allowlist matches ** across directories and * within one", () => {
  assert.ok(globMatch("tools/tests/**", "tools/tests/fixtures/sample.md"));
  assert.ok(globMatch("people/*/notes.md", "people/pat-lee/notes.md"));
  assert.ok(!globMatch("people/*/notes.md", "people/pat-lee/sub/notes.md"));
});

test("isAllowed honors both exact strings and path globs", () => {
  const allow = { paths: ["fixtures/**"], strings: ["219-09-9999"] };
  assert.ok(isAllowed("anywhere.md", "219-09-9999", allow));
  assert.ok(isAllowed("fixtures/sample.md", "anything", allow));
  assert.ok(!isAllowed("real/file.md", "219-09-9999 ", allow));
});

test("scanFile reports file/line and respects the allowlist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-test-"));
  try {
    const file = join(dir, "notes.md");
    writeFileSync(file, "name: Pat\nssn: 219-09-9999\n");
    const unfiltered = await scanFile(file, "notes.md", { paths: [], strings: [] });
    assert.equal(unfiltered.length, 1);
    assert.equal(unfiltered[0].line, 2);
    assert.equal(unfiltered[0].kind, "ssn");
    assert.ok(!unfiltered[0].snippet.includes("219-09-9999"));

    const filtered = await scanFile(file, "notes.md", { paths: [], strings: ["219-09-9999"] });
    assert.equal(filtered.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scanFile skips unsupported extensions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-test-"));
  try {
    const file = join(dir, "photo.png");
    writeFileSync(file, "219-09-9999");
    const hits = await scanFile(file, "photo.png", { paths: [], strings: [] });
    assert.deepEqual(hits, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
