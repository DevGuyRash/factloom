import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listApplications } from "./applications.ts";
import { peek, readDoc } from "./frontmatter.ts";
import { dropWaiting, factsWithoutExperience, importedNotes } from "./intake.ts";
import { loadPipelineConfig } from "./pipeline-config.ts";
import { loadQueue } from "./queue.ts";
import { findByType, personDir, repoRoot, today } from "./repo.ts";
import { dueSearches } from "./searches.ts";
import { FILE_NAMES, INTERVIEW_STATUS, RESPONDED_STATUS } from "./schema.ts";
import { relative } from "./when.ts";

export type GroupCounts = { total: number; responded: number; interview: number };
export type StatsReport = {
  byVariant: Record<string, GroupCounts>;
  byCoverLetter: Record<string, GroupCounts>;
  bySource: Record<string, GroupCounts>;
  bySite: Record<string, GroupCounts>;
};

function bump(map: Record<string, GroupCounts>, key: string, status: string) {
  const k = key || "(unknown)";
  const c = (map[k] ??= { total: 0, responded: 0, interview: 0 });
  c.total++;
  if ((RESPONDED_STATUS as readonly string[]).includes(status)) c.responded++;
  if ((INTERVIEW_STATUS as readonly string[]).includes(status)) c.interview++;
}

/** Statuses of an application that went to the employer. */
const SENT = new Set(["submitted", "rejected", "interviewing", "offer", "closed"]);

/** Whether an application went to the employer: drafted, held, and skipped ones never did. */
export const wasSent = (r: { status: string; applied?: unknown }) => SENT.has(r.status) || (r.status === "withdrawn" && !!r.applied);

/** Where a posting was found, as a site: the host of a link, or the text as given. */
const sourceKey = (source: unknown) => {
  const s = String(source ?? "").trim();
  try {
    return new URL(s).host.replace(/^www\./, "");
  } catch {
    return s || "(unknown)";
  }
};

/**
 * Response and interview counts over the applications actually sent, grouped by resume variant, cover-letter use,
 * source (the site a posting was found on), and site. Small samples stay visible via `total`.
 */
export function computeStats(person: string, root = repoRoot()): StatsReport {
  const out: StatsReport = { byVariant: {}, byCoverLetter: {}, bySource: {}, bySite: {} };
  for (const app of listApplications(person, root)) {
    const r = app.record;
    if (!r || !wasSent(r)) continue;
    bump(out.byVariant, String(r.resume ?? "(none)"), r.status);
    bump(out.byCoverLetter, r.cover_letter === "yes" ? "yes" : "no", r.status);
    bump(out.bySource, sourceKey(r.source || r.url), r.status);
    bump(out.bySite, String(r.site ?? "(unknown)"), r.status);
  }
  return out;
}

export type PayRow = { key: string; min: number; median: number; max: number; n: number };

function annualize(value: number, period: string | undefined, hoursPerYear: number): number {
  switch ((period ?? "year").toLowerCase()) {
    case "hour": return value * hoursPerYear;
    case "month": return value * 12;
    case "week": return value * 52;
    default: return value;
  }
}

/** Pay ranges from posting snapshots, normalized to annual (shared/pipeline.yaml's hours_per_year), grouped by variant, role, or site. */
export function aggregatePay(person: string, by: "variant" | "role" | "site" = "variant", root = repoRoot()): PayRow[] {
  const { hours_per_year } = loadPipelineConfig(root);
  const groups = new Map<string, number[]>();
  for (const app of listApplications(person, root)) {
    const r = app.record;
    const p = app.posting as Record<string, unknown> | null;
    if (!p) continue;
    const period = p.pay_period as string | undefined;
    const vals: number[] = [];
    if (typeof p.pay_min === "number") vals.push(annualize(p.pay_min, period, hours_per_year));
    if (typeof p.pay_max === "number") vals.push(annualize(p.pay_max, period, hours_per_year));
    if (!vals.length) continue;
    const key = String(by === "variant" ? r?.resume ?? "(none)" : by === "role" ? r?.role ?? "(unknown)" : r?.site ?? "(unknown)");
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(...vals);
  }
  const rows: PayRow[] = [];
  for (const [key, vals] of groups) {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    rows.push({ key, min: Math.round(sorted[0]), median: Math.round(mid), max: Math.round(sorted[sorted.length - 1]), n: vals.length });
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export type PendingSnapshot = {
  statusCounts: Record<string, number>;
  /** Held applications, with the kind of hold, the catalog id one waits on, and when it is due or its posting closes, when `app hold` and `app new` recorded them. */
  held: { dir: string; company: string; role: string; reason: string; kind?: string; waitsOn?: string; due?: string; closes?: string }[];
  /** Applications whose final submit was clicked (`app submitting`) but never recorded as sent: check the site, never resend. */
  submitClicked: { dir: string; company: string; role: string; at: string }[];
  /** Sent applications with a step still to come (an assessment, an account at the employer), and when it is due. */
  pendingSteps: { dir: string; company: string; role: string; pending: string; due?: string }[];
  /** Interviews still to come, and those of the last week, soonest first; `thankYou` is whether a thank-you was drafted. */
  interviews: { dir: string; company: string; role: string; at: string; ms: number; when: string; thankYou: boolean }[];
  /** Application records whose frontmatter does not parse, so no command can see them. */
  unreadable: { dir: string; error: string }[];
  queueOpen: number;
  queueStale: number;
  followupsDue: { dir: string; company: string; role: string; followUp: string }[];
  inboxCount: number;
  guidesNeedingReview: { path: string }[];
  /** Guides never researched, or researched longer ago than the pipeline's guide_research_days. */
  guidesNeedingResearch: { path: string; researched: string | null }[];
  searchesDue: number;
  /** Resume intake: files waiting in drop/, and imported resumes not yet written into facts.yaml. */
  intake: { dropWaiting: number; pending: { path: string; status: string }[]; noExperienceYet: boolean };
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - Date.parse(`${dateStr}T00:00:00`)) / 86400000);
}

const HELD_LINE = /^- (\d{4}-\d{2}-\d{2}): held — (.*)$/;

/**
 * Why a held application waits: the last `- <date>: held — <reason>` line that `app hold` appends to the record,
 * else the first line of prose in a record held by hand (headings and template comments skipped).
 */
export function heldReason(recordPath: string | null): string {
  if (!recordPath) return "";
  const lines = readDoc(recordPath).body.split("\n").map((l) => l.trim());
  const held = lines.map((l) => l.match(HELD_LINE)).filter((m) => m !== null).pop();
  // The due time is shown as its own field; the note line keeps it for whoever reads the record.
  if (held) return `${held[2].replace(/ \(due [^)]*\)$/, "")} (since ${held[1]})`;
  return lines.find((l) => l && !l.startsWith("#") && !l.startsWith("<!--")) ?? "";
}

/**
 * Everything "pending" for a person in one pass: status counts, held reasons, queue and search
 * staleness, follow-ups due, inbox size, and guides awaiting review. Drives both `status` (plain
 * text) and `dashboard` (written to a file via the dashboard template).
 */
export function pendingSnapshot(person: string, root = repoRoot()): PendingSnapshot {
  const cfg = loadPipelineConfig(root);
  const statusCounts: Record<string, number> = {};
  const held: PendingSnapshot["held"] = [];
  const followupsDue: PendingSnapshot["followupsDue"] = [];
  const submitClicked: PendingSnapshot["submitClicked"] = [];
  const pendingSteps: PendingSnapshot["pendingSteps"] = [];
  const interviews: PendingSnapshot["interviews"] = [];
  const unreadable: PendingSnapshot["unreadable"] = [];
  const todayStr = today();
  for (const app of listApplications(person, root)) {
    const r = app.record;
    if (app.recordError) unreadable.push({ dir: app.dir, error: app.recordError });
    if (!r) continue;
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    const who = { dir: app.dir, company: String(r.company), role: String(r.role) };
    if (r.submit_clicked && r.status !== "submitted") submitClicked.push({ ...who, at: String(r.submit_clicked) });
    if (r.status === "submitted" && r.pending) pendingSteps.push({ ...who, pending: `${r.pending}${r.pending_waits_on ? ` [waits on ${r.pending_waits_on}]` : ""}`, ...(r.due ? { due: String(r.due) } : {}) });
    if (r.status === "blocked") {
      held.push({ ...who, reason: heldReason(app.recordPath), ...(r.hold_kind ? { kind: String(r.hold_kind) } : {}), ...(r.waits_on ? { waitsOn: String(r.waits_on) } : {}), ...(r.due ? { due: String(r.due) } : {}), ...(r.closes ? { closes: String(r.closes) } : {}) });
    }
    if (Array.isArray(r.interviews)) {
      const now = Date.now();
      for (const value of r.interviews.map(String)) {
        const ms = Date.parse(value);
        if (Number.isNaN(ms) || ms < now - 7 * 86400000) continue;
        interviews.push({ ...who, at: value, ms, when: relative(ms, now), thankYou: existsSync(join(app.dir, FILE_NAMES.thankYou)) });
      }
    }
    if (r.status === "submitted" && typeof r.follow_up === "string" && r.follow_up <= todayStr) {
      followupsDue.push({ dir: app.dir, company: String(r.company), role: String(r.role), followUp: r.follow_up });
    }
  }
  const { items } = loadQueue(person, root);
  const open = items.filter((i) => i.status !== "done");
  const queueStale = open.filter((i) => daysSince(i.found) >= cfg.stale_queue_days).length;
  const inboxPath = findByType(personDir(person, root), "inbox")[0];
  const inboxCount = inboxPath ? (readFileSync(inboxPath, "utf8").match(/^### /gm) ?? []).length : 0;
  const guidesNeedingReview = findByType(personDir(person, root), "resume-guide")
    .filter((p) => peek(p)?.status === "needs-review")
    .map((path) => ({ path }));
  const guidesNeedingResearch = findByType(personDir(person, root), "resume-guide").flatMap((path) => {
    const value = peek(path)?.researched;
    const researched = typeof value === "string" && value ? value : null;
    return !researched || daysSince(researched) >= cfg.guide_research_days ? [{ path, researched }] : [];
  });
  const intake = {
    dropWaiting: dropWaiting(person, root).length,
    pending: importedNotes(person, root).filter((n) => n.status !== "merged").map((n) => ({ path: n.path, status: n.status })),
    noExperienceYet: factsWithoutExperience(person, root),
  };
  interviews.sort((x, y) => x.ms - y.ms);
  return { statusCounts, held, submitClicked, pendingSteps, interviews, unreadable, queueOpen: open.length, queueStale, followupsDue, inboxCount, guidesNeedingReview, guidesNeedingResearch, searchesDue: dueSearches(person, root).length, intake };
}
