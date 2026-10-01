import assert from "node:assert";
import test from "node:test";
import { classifyEmail, extractCodes } from "../src/lib/email.ts";

test("classifyEmail recognizes verification, confirmation, rejection, interview, job-alert, and other", () => {
  assert.equal(classifyEmail("Your verification code is 482913. Enter it to verify your email.").category, "verification");
  assert.equal(classifyEmail("Thank you for applying. We have received your application for Data Analyst.").category, "confirmation");
  assert.equal(classifyEmail("Unfortunately, we have decided not to proceed with your application at this time.").category, "rejection");
  assert.equal(classifyEmail("We would like to schedule an interview for the role you applied to.").category, "interview");
  assert.equal(classifyEmail("New jobs that match your search are ready to view.").category, "job-alert");
  const other = classifyEmail("Your package has shipped and is on its way.");
  assert.equal(other.category, "other");
  assert.ok(other.confidence > 0 && other.confidence < 1);
});

test("classifyEmail prioritizes interview over a stray 'unfortunately'", () => {
  const r = classifyEmail("We'd like to schedule an interview for next week; unfortunately our first slot fell through.");
  assert.equal(r.category, "interview");
});

test("extractCodes finds a code near a keyword and ignores unrelated numbers", () => {
  const r = extractCodes("Your confirmation code: 482913. Order #10294811 shipped.");
  assert.deepEqual(r.codes, ["482913"]);
});

test("extractCodes reads the code on its keyword's line and never takes a word for a code", () => {
  const r = extractCodes("Subject: Your verification code\nYour verification code is 482913. It expires in 10 minutes.");
  assert.deepEqual(r.codes, ["482913"]);
  assert.deepEqual(extractCodes("Your one-time passcode is 7Q4K9Z").codes, ["7Q4K9Z"]);
});

test("extractCodes falls back to a standalone 6-digit code only when the text is about verification", () => {
  const withHint = extractCodes("Please verify your account. Code 918273 expires in 10 minutes.");
  assert.deepEqual(withHint.codes, ["918273"]);
  const withoutHint = extractCodes("Meeting moved to room 918273 on the third floor.");
  assert.deepEqual(withoutHint.codes, []);
});

test("extractCodes collects verification links and skips unrelated ones", () => {
  const r = extractCodes("Verify here: https://example.com/verify?token=abc123 or see https://example.com/about.");
  assert.deepEqual(r.links, ["https://example.com/verify?token=abc123"]);
});
