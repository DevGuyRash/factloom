import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import outcome from "../src/commands/outcome.ts";
import exportCommand from "../src/commands/export.ts";
import { run as check } from "../src/commands/check.ts";
import { applicationRecordErrors } from "../src/lib/application-history.ts";
import { listApplications, type Record_ } from "../src/lib/applications.ts";
import { readDoc, writeDoc } from "../src/lib/frontmatter.ts";
import { computeStats, pendingSnapshot } from "../src/lib/stats.ts";
import { makeFixture } from "./helpers/fixture.ts";

function fixture(fn: (fx: ReturnType<typeof makeFixture>) => Promise<void>) {
  return async () => {
    const fx = makeFixture();
    const old = process.env.RESUMES_ROOT;
    process.env.RESUMES_ROOT = fx.root;
    try { await fn(fx); }
    finally {
      if (old === undefined) delete process.env.RESUMES_ROOT; else process.env.RESUMES_ROOT = old;
      fx.cleanup();
    }
  };
}
const app = (args: string[]) => appCommand.run([...args, "--person", "pat-lee", "--no-log"]);
const result = (args: string[]) => outcome.run([...args, "--person", "pat-lee"]);
async function create() {
  await app(["new", "--company", "Example Works", "--role", "Analyst"]);
  const record = listApplications("pat-lee")[0];
  return { dir: record.name, path: record.recordPath!, read: () => readDoc<Record_>(record.recordPath!) };
}
async function capture(fn: () => unknown) {
  const lines: string[] = [], old = console.log;
  console.log = (...xs: unknown[]) => { lines.push(xs.join(" ")); };
  try { await fn(); return lines.join("\n"); } finally { console.log = old; }
}

test("structured employer details preserve postal strings, partial contacts, unknowns, and extension data", fixture(async () => {
  await app(["new", "--company", "Example Works", "--role", "Analyst", "--country", "US", "--zip", "00123", "--contact-first", "Casey", "--contact-email", "hiring@example.com", "--alternate-zip", "00456"]);
  const r = listApplications("pat-lee")[0], path = r.recordPath!;
  const doc = readDoc<Record_>(path);
  assert.equal(doc.data.address_of_record?.zip, "00123");
  assert.equal(doc.data.alternate_location?.zip, "00456");
  assert.equal(doc.data.address_of_record?.address, undefined);
  assert.equal(doc.data.date_contacted, undefined);
  doc.data.custom_field = { keep: true }; writeDoc(path, doc.data, doc.body);
  await app(["details", r.name, "--contact-phone", "+1 202-555-0148", "--city", "Example City"]);
  const next = readDoc<Record_>(path);
  assert.equal(next.data.contact?.email, "hiring@example.com");
  assert.equal(next.data.contact?.first, "Casey");
  assert.equal(next.data.contact?.phone, "+1 202-555-0148");
  assert.equal(next.data.address_of_record?.zip, "00123");
  assert.deepEqual(next.data.custom_field, { keep: true });
  assert.deepEqual(next.data.events?.map((e) => e.kind), ["created", "details-updated"]);
}));

test("contacts and submission keep occurrence dates distinct from recorded dates and retain repeated notes", fixture(async () => {
  const r = await create();
  await app(["event", r.dir, "contacted", "--on", "2025-03-04", "--contact-method", "phone"]);
  await app(["event", r.dir, "contacted", "--on", "2025-03-01", "--contact-method", "email", "--note", "Earlier contact confirmed"]);
  await app(["submit", r.dir, "--on", "2025-03-05", "--confirmation", "Receipt"]);
  await app(["note", r.dir, "Follow-up notes", "--on", "2025-03-06"]);
  const { data, body } = r.read();
  assert.equal(data.date_contacted, "2025-03-01");
  assert.equal(data.applied, "2025-03-05");
  assert.equal(data.contact_method, "email");
  assert.equal(data.events?.filter((e) => e.kind === "contacted").length, 2);
  assert.equal(data.events?.find((e) => e.kind === "submitted")?.on, "2025-03-05");
  assert.match(data.events![1].recorded_at, /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/);
  assert.match(body, /2025-03-06: Follow-up notes/);
  const before = readFileSync(r.path, "utf8");
  assert.throws(() => app(["submit", r.dir]), /already submitted/);
  assert.equal(readFileSync(r.path, "utf8"), before);
}));

test("interview rounds, rescheduling, cancellation, and confirmed attendance survive later hiring and start", fixture(async () => {
  const r = await create();
  await app(["submit", r.dir, "--on", "2025-03-01"]);
  await result([r.dir, "interviewing", "--on", "2025-03-02", "--at", "2025-03-03T10:00-05:00", "--round", "First"]);
  await result([r.dir, "interviewing", "--on", "2025-03-03", "--at", "2025-03-04T10:00-05:00", "--round", "Second"]);
  await result([r.dir, "interviewing", "--on", "2025-03-03", "--at", "2025-03-05T10:00-05:00", "--replaces", "2025-03-04T10:00-05:00", "--round", "Second"]);
  await result([r.dir, "interviewing", "--on", "2025-03-04", "--cancel", "2025-03-05T10:00-05:00"]);
  await app(["event", r.dir, "interview-attended", "--on", "2025-03-03", "--at", "2025-03-03T10:00-05:00", "--round", "First", "--note", "Person confirmed"]);
  await result([r.dir, "hired", "--on", "2025-03-06", "--start", "2025-03-10"]);
  assert.equal(r.read().data.started, undefined, "a planned start never means actually started");
  await result([r.dir, "started", "--on", "2025-03-11"]);
  const { data } = r.read();
  assert.equal(data.hired, "2025-03-06");
  assert.equal(data.start_date, "2025-03-10");
  assert.equal(data.started, "2025-03-11");
  assert.deepEqual(data.interviews, ["2025-03-03T10:00-05:00"]);
  assert.equal(data.events?.filter((e) => e.kind === "interview-scheduled").length, 2);
  assert.equal(data.events?.find((e) => e.kind === "interview-rescheduled")?.replaces, "2025-03-04T10:00-05:00");
  assert.equal(data.events?.find((e) => e.kind === "interview-cancelled")?.at, "2025-03-05T10:00-05:00");
  assert.equal(data.events?.find((e) => e.kind === "interview-attended")?.round, "First");
  assert.equal(data.events?.find((e) => e.kind === "start-scheduled")?.start_date, "2025-03-10");
  assert.deepEqual(computeStats("pat-lee").byVariant["(none)"], { total: 1, responded: 1, interview: 1 });
}));

test("explicit custom statuses and extra milestones keep sent/history statistics and validate", fixture(async (fx) => {
  const r = await create();
  await app(["submit", r.dir]);
  await result([r.dir, "rejected"]);
  await result([r.dir, "talent-pool", "--custom", "--note", "Employer invited future contact"]);
  await app(["event", r.dir, "assessment-completed", "--note", "Receipt recorded"]);
  assert.equal(r.read().data.status, "talent-pool");
  await app(["hold", r.dir, "--reason", "Updated portfolio requested"]);
  assert.equal(r.read().data.status, "talent-pool");
  assert.equal(pendingSnapshot("pat-lee").pendingSteps.length, 1);
  await app(["resolve", r.dir]);
  assert.equal(pendingSnapshot("pat-lee").pendingSteps.length, 0);
  assert.deepEqual(computeStats("pat-lee").byVariant["(none)"], { total: 1, responded: 1, interview: 0 });
  assert.equal((await check(fx.root)).errors.length, 0);
  await result([r.dir, "not-hired"]);
  await result([r.dir, "work-not-available"]);
  assert.equal(r.read().data.status, "work-not-available");
}));

test("invalid dates, timezone omissions, missing values, and malformed history cannot change the record", fixture(async () => {
  const r = await create();
  for (const args of [["event", r.dir, "contacted", "--on", "2025-02-30"], ["details", r.dir, "--zip"], ["event", r.dir, "interview-attended", "--at", "2025-03-02T10:00"], ["event", r.dir, "submitted"]]) {
    const before = readFileSync(r.path, "utf8");
    assert.throws(() => app(args));
    assert.equal(readFileSync(r.path, "utf8"), before);
  }
  for (const args of [[r.dir, "hired", "--start", "2025-02-30"], [r.dir, "interviewing", "--at", "2025-02-30T10:00Z"], [r.dir, "interviewing", "--cancel", "2025-03-02T10:00Z"], [r.dir, "Unknown", "--custom"], [r.dir, "drafted", "--custom"]]) {
    const before = readFileSync(r.path, "utf8");
    assert.throws(() => result(args));
    assert.equal(readFileSync(r.path, "utf8"), before);
  }
  const d = r.read(); writeDoc(r.path, { ...d.data, events: { invalid: true } }, d.body);
  const before = readFileSync(r.path, "utf8");
  assert.throws(() => app(["note", r.dir, "Do not erase broken history"]), /events must be a list/);
  assert.equal(readFileSync(r.path, "utf8"), before);
  assert.ok(applicationRecordErrors({ contact: [], address_of_record: { zip: 123 }, hired: "2025-02-30", events: [{ kind: "Bad kind", on: "unknown" }] }).length >= 5);
}));

test("legacy records remain unmigrated while notes and CSV/JSON/history exports include new details", fixture(async () => {
  const r = await create();
  const d = r.read(); delete d.data.events;
  d.data.extension = { keep: "value" }; d.body += '\nAn older note, with "quotes".\n';
  writeDoc(r.path, d.data, d.body);
  assert.match(await capture(() => app(["history", r.dir])), /No structured history yet/);
  await app(["details", r.dir, "--zip", "00123", "--contact-email", "hiring@example.com"]);
  await app(["note", r.dir, "New note"]);
  const next = r.read();
  assert.equal(next.data.events?.length, 2);
  assert.equal(next.data.applied, undefined);
  assert.equal(next.data.date_contacted, undefined);
  assert.deepEqual(next.data.extension, { keep: "value" });
  assert.match(next.body, /An older note/);
  const json = JSON.parse(await capture(() => exportCommand.run(["--format", "json", "--person", "pat-lee"])));
  assert.equal(json[0].address_of_record.zip, "00123");
  assert.equal(json[0].events.length, 2);
  assert.match(json[0].record_notes, /An older note/);
  const csv = await capture(() => exportCommand.run(["--person", "pat-lee"]));
  assert.match(csv, /address_of_record.zip/); assert.match(csv, /00123/); assert.match(csv, /""quotes""/);
  const history = JSON.parse(await capture(() => app(["history", r.dir, "--format", "json"])));
  assert.deepEqual(history, next.data.events);
}));

test("terminal outcomes stop future reminders while preserving the scheduled interview and event", fixture(async () => {
  const r = await create();
  await result([r.dir, "interviewing", "--at", "2099-03-02T10:00Z"]);
  assert.equal(pendingSnapshot("pat-lee").interviews.length, 1);
  await result([r.dir, "not-hired"]);
  assert.equal(pendingSnapshot("pat-lee").interviews.length, 0);
  assert.deepEqual(r.read().data.interviews, ["2099-03-02T10:00Z"]);
  assert.equal(r.read().data.events?.filter((e) => e.kind === "interview-scheduled").length, 1);
}));
