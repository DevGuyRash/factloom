// Time in the records: interviews with their offsets, due times on holds and pending steps, close dates on postings.
// The commands are driven the way an agent drives them; expected values are worked out by hand from fixed offsets.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import appCommand from "../src/commands/app.ts";
import dashboardCommand from "../src/commands/dashboard.ts";
import draftCommand from "../src/commands/draft.ts";
import outcomeCommand from "../src/commands/outcome.ts";
import queueCommand from "../src/commands/queue.ts";
import statusCommand from "../src/commands/status.ts";
import { readDoc } from "../src/lib/frontmatter.ts";
import { normalizeAt, parseWhen, relative } from "../src/lib/when.ts";
import { makeFixture } from "./helpers/fixture.ts";

type Run = (argv: string[]) => number | Promise<number>;

/** Runs a command against a fixture and returns what it printed (stdout and stderr, in order). */
async function printed(run: Run, argv: string[]): Promise<{ code: number; text: string }> {
  const log = console.log, err = console.error;
  const out: string[] = [];
  console.log = (...m: unknown[]) => out.push(m.join(" "));
  console.error = (...m: unknown[]) => out.push(m.join(" "));
  try {
    return { code: await run(argv), text: out.join("\n") };
  } finally {
    console.log = log;
    console.error = err;
  }
}

async function withFixture(fn: (fx: ReturnType<typeof makeFixture>, p: string[]) => Promise<void>): Promise<void> {
  const fx = makeFixture();
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = fx.root;
  try {
    await fn(fx, ["--person", "pat-lee"]);
  } finally {
    if (prev === undefined) delete process.env.RESUMES_ROOT;
    else process.env.RESUMES_ROOT = prev;
    fx.cleanup();
  }
}

/** `hours` from now, written as the wall clock of a zone `offset` from UTC, with that offset (`2026-10-12T14:00-07:00`). */
function inHours(hours: number, offset = "-07:00"): string {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.slice(1).split(":").map(Number);
  return `${new Date(Date.now() + hours * 3600000 + sign * (h * 60 + m) * 60000).toISOString().slice(0, 16)}${offset}`;
}

/** A calendar date `days` from today on this computer. */
function onDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

async function newApplication(p: string[], company: string, extra: string[] = []): Promise<string> {
  const r = await printed(appCommand.run, ["new", "--company", company, "--role", "Analyst", "--url", `https://${company.toLowerCase()}.example/jobs/1`, ...extra, ...p]);
  assert.equal(r.code, 0, r.text);
  return r.text.trim().split("\n").pop()!;
}

test("an interview is recorded with its offset, appears in status, the prep draft, and the dashboard, moves, and is cancelled", () => withFixture(async (fx, p) => {
  const dir = await newApplication(p, "Acme");
  const record = () => readDoc<{ status: string; interviews?: string[] }>(join(fx.root, dir, "record.md"));

  const first = inHours(48);
  const booked = await printed(outcomeCommand.run, [dir, "interviewing", "--at", first, "--note", "video with the hiring manager", ...p]);
  assert.equal(booked.code, 0, booked.text);
  assert.deepEqual(record().data.interviews, [first]);
  assert.equal(record().data.status, "interviewing");
  assert.match(record().body, new RegExp(`interviewing \\(interview ${first.replace("+", "\\+")}\\) — video with the hiring manager`));

  // What a later activation sees, with the distance in days.
  const seen = await printed(statusCommand.run, p);
  assert.match(seen.text, /interviews: 1 coming up, 0 in the last week/);
  assert.match(seen.text, new RegExp(`${first} \\(in 2 days\\).*Acme — Analyst`));

  // The prep draft carries the time; the dashboard lists the interview.
  assert.equal((await printed(draftCommand.run, ["interview-prep", join(fx.root, dir), ...p])).code, 0);
  assert.match(readFileSync(join(fx.root, dir, "interview-prep.md"), "utf8"), new RegExp(`Date and time: ${first.replace("+", "\\+")}`));
  assert.equal((await printed(dashboardCommand.run, p)).code, 0);
  const dashboard = readFileSync(join(fx.root, "people/pat-lee/dashboard.md"), "utf8");
  assert.match(dashboard, /## Interviews[\s\S]*Acme[\s\S]*## Follow-ups due/);

  // Moved: the same interview at a new time, in another zone; the old time is gone.
  const moved = inHours(72, "+05:30");
  assert.equal((await printed(outcomeCommand.run, [dir, "interviewing", "--at", moved, "--replaces", first, ...p])).code, 0);
  assert.deepEqual(record().data.interviews, [moved]);
  assert.match(record().body, /moved from/);
  assert.match((await printed(statusCommand.run, p)).text, /\(in 3 days\)/);

  // A second round sorts after the first; cancelling one leaves the other.
  const second = inHours(200);
  await printed(outcomeCommand.run, [dir, "interviewing", "--at", second, ...p]);
  assert.deepEqual(record().data.interviews, [moved, second]);
  assert.equal((await printed(outcomeCommand.run, [dir, "interviewing", "--cancel", moved, ...p])).code, 0);
  assert.deepEqual(record().data.interviews, [second]);
  await printed(outcomeCommand.run, [dir, "interviewing", "--cancel", second, ...p]);
  assert.equal(record().data.interviews, undefined, "no interviews left, no field left");
  assert.doesNotMatch((await printed(statusCommand.run, p)).text, /interviews:/);
}));

test("a time without its offset, or one that is not on the record, is refused, and so is --at on another outcome", () => withFixture(async (fx, p) => {
  const dir = await newApplication(p, "Acme");
  assert.throws(() => outcomeCommand.run([dir, "interviewing", "--at", "2026-10-12 14:00", ...p]), /UTC offset/);
  assert.throws(() => outcomeCommand.run([dir, "interviewing", "--at", "next Thursday", ...p]), /UTC offset/);
  assert.throws(() => outcomeCommand.run([dir, "rejected", "--at", inHours(24), ...p]), /go with interviewing/);
  assert.throws(() => outcomeCommand.run([dir, "interviewing", "--cancel", inHours(24), ...p]), /no interview at/);
  assert.throws(() => outcomeCommand.run([dir, "interviewing", "--replaces", inHours(24), ...p]), /--replaces needs --at/);
  assert.equal(readDoc<{ interviews?: string[] }>(join(fx.root, dir, "record.md")).data.interviews, undefined, "nothing was written");
}));

test("a recent interview with no thank-you drafted is flagged until one is drafted; an old one drops off", () => withFixture(async (fx, p) => {
  const dir = await newApplication(p, "Acme");
  const old = await newApplication(p, "Oldco");
  await printed(outcomeCommand.run, [dir, "interviewing", "--at", inHours(-30), ...p]);
  await printed(outcomeCommand.run, [old, "interviewing", "--at", inHours(-24 * 9), ...p]);
  let seen = await printed(statusCommand.run, p);
  assert.match(seen.text, /interviews: 0 coming up, 1 in the last week/);
  assert.match(seen.text, /\(30 hours ago; no thank-you drafted\).*Acme/);
  assert.doesNotMatch(seen.text, /Oldco/, "nine days ago is past the week status keeps");
  await printed(draftCommand.run, ["thank-you", join(fx.root, dir), ...p]);
  seen = await printed(statusCommand.run, p);
  assert.match(seen.text, /\(30 hours ago\)/);
  assert.doesNotMatch(seen.text, /no thank-you drafted/);
  assert.ok(existsSync(join(fx.root, dir, "thank-you.md")));
}));

test("a hold's due time is shown soonest first and as overdue once passed; resolve closes a sent application's pending step", () => withFixture(async (fx, p) => {
  const later = await newApplication(p, "Latecorp");
  const sooner = await newApplication(p, "Soonco");
  const open = await newApplication(p, "Plainco");
  const lapsed = await newApplication(p, "Lapsed");
  const late = onDay(5), soon = onDay(1), gone = onDay(-1);
  for (const [d, due] of [[later, late], [sooner, soon], [lapsed, gone]] as const) {
    const held = await printed(appCommand.run, ["hold", d, "--reason", "assessment link", "--kind", "person-step", "--due", due, ...p]);
    assert.equal(held.code, 0, held.text);
  }
  await printed(appCommand.run, ["hold", open, "--reason", "needs an answer", "--kind", "person-step", ...p]);
  const seen = (await printed(statusCommand.run, p)).text;
  const order = ["Lapsed", "Soonco", "Latecorp", "Plainco"].map((c) => seen.indexOf(`(${c} —`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `due soonest first, undated last: ${order}`);
  assert.match(seen, new RegExp(`Lapsed[^\\n]*\\[due ${gone}, overdue\\]`));
  assert.match(seen, new RegExp(`Soonco[^\\n]*\\[due ${soon}, in \\d+ hours\\]`));
  assert.doesNotMatch(seen.split("\n").find((l) => l.includes("Plainco"))!, /due/);

  // A sent application with a pending step carries the due time; resolving clears it and the step.
  await printed(appCommand.run, ["submit", sooner, "--confirmation", "ok", ...p]);
  assert.equal(readDoc<{ due?: string }>(join(fx.root, sooner, "record.md")).data.due, undefined, "submitting clears a hold's due time");
  await printed(appCommand.run, ["hold", sooner, "--reason", "complete the skills assessment", "--due", soon, ...p]);
  assert.match((await printed(statusCommand.run, p)).text, new RegExp(`sent, with a step pending: 1[\\s\\S]*complete the skills assessment \\[due ${soon}`));
  const done = await printed(appCommand.run, ["resolve", sooner, "--note", "scored and sent", ...p]);
  assert.equal(done.code, 0, done.text);
  const rec = readDoc<{ status: string; pending?: string; due?: string }>(join(fx.root, sooner, "record.md"));
  assert.equal(rec.data.status, "submitted");
  assert.equal(rec.data.pending, undefined);
  assert.equal(rec.data.due, undefined);
  assert.match(rec.body, /pending step done — complete the skills assessment — scored and sent/);
  assert.doesNotMatch((await printed(statusCommand.run, p)).text, /sent, with a step pending/);
  assert.throws(() => appCommand.run(["resolve", sooner, ...p]), /no pending step/);
  assert.throws(() => appCommand.run(["hold", later, "--reason", "x", "--due", "Friday", ...p]), /--due takes/);

  // Reopening a held application drops its due time.
  await printed(appCommand.run, ["reopen", later, "--reason", "answered", ...p]);
  assert.equal(readDoc<{ due?: string }>(join(fx.root, later, "record.md")).data.due, undefined);
}));

test("a posting about to close is suggested first, and one whose close date passed is closed as skipped", () => withFixture(async (fx, p) => {
  const add = (n: string, extra: string[]) => printed(queueCommand.run, ["add", "--url", `https://${n}.example/job/1`, "--company", n, "--role", "Analyst", ...extra, ...p]);
  await add("farclose", ["--score", "90", "--closes", onDay(20)]);
  await add("noclose", ["--score", "95"]);
  await add("closesoon", ["--score", "50", "--closes", onDay(2)]);
  await add("expired", ["--score", "99", "--closes", onDay(-1)]);
  assert.throws(() => queueCommand.run(["add", "--url", "https://x.example/1", "--closes", "soon", ...p]), /--closes takes YYYY-MM-DD/);

  const list = await printed(queueCommand.run, ["next", "--count", "5", ...p]);
  assert.match(list.text, /closed 1 queue item\(s\): their application had moved on, or their close date had passed/);
  const order = ["closesoon", "noclose", "farclose"].map((n) => list.text.indexOf(`${n} —`));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `closing first, then by score: ${order}`);
  assert.match(list.text, new RegExp(`closes ${onDay(2)} \\(in 2 days\\)`));
  assert.doesNotMatch(list.text, /expired —/, "the lapsed posting is no longer suggested");
  const items = readDoc<{ items: { company: string; status: string; outcome?: string; note?: string }[] }>(join(fx.root, "people/pat-lee/queue.md")).data.items;
  const expired = items.find((i) => i.company === "expired")!;
  assert.deepEqual([expired.status, expired.outcome, expired.note], ["done", "skipped", `close date ${onDay(-1)} passed`]);

  // The close date of an application goes into its record, and a held one shows it in status.
  const dir = await newApplication(p, "Closing", ["--closes", onDay(3)]);
  assert.equal(readDoc<{ closes?: string }>(join(fx.root, dir, "record.md")).data.closes, onDay(3));
  await printed(appCommand.run, ["hold", dir, "--reason", "needs an answer", ...p]);
  assert.match((await printed(statusCommand.run, p)).text, new RegExp(`Closing[^\\n]*\\[posting closes ${onDay(3)}, in 3 days\\]`));
}));

test("times are read only with their offset, due dates run to the end of the day, and distances are said in days, hours, or minutes", () => {
  assert.equal(normalizeAt("2026-10-12T14:00-07:00")?.text, "2026-10-12T14:00-07:00");
  assert.equal(normalizeAt("2026-10-12 14:00 -0700")?.text, "2026-10-12T14:00-07:00");
  assert.equal(normalizeAt("2026-10-12T21:00:30Z")?.ms, Date.parse("2026-10-12T21:00:30Z"));
  assert.equal(normalizeAt("2026-10-12T14:00-07:00")?.ms, normalizeAt("2026-10-12T21:00Z")?.ms, "the same instant in two zones");
  for (const bad of ["2026-10-12T14:00", "2026-10-12", "tomorrow at 2pm", "2026-13-45T10:00Z", ""]) assert.equal(normalizeAt(bad), null, bad);
  assert.equal(parseWhen("2026-10-12")?.ms, Date.parse("2026-10-12T23:59:59"));
  assert.equal(parseWhen("2026-10-12T14:00-07:00")?.text, "2026-10-12T14:00-07:00");
  const now = Date.parse("2026-10-10T12:00:00Z");
  assert.equal(relative(now + 2 * 86400000, now), "in 2 days");
  assert.equal(relative(now + 86400000, now), "in 24 hours");
  assert.equal(relative(now + 3 * 3600000, now), "in 3 hours");
  assert.equal(relative(now - 40 * 60000, now), "40 minutes ago");
  assert.equal(relative(now + 2 * 60000, now), "now");
  assert.equal(relative(now - 3 * 86400000, now), "3 days ago");
});
