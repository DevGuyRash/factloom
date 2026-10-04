import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { peek, readDoc } from "./frontmatter.ts";
import { personDir, repoRoot, today, walkMarkdown } from "./repo.ts";
import { APPLICATION_DIR, FILE_NAMES, type ApplicationStatus } from "./schema.ts";
import { normalizeCompany, normalizeUrl, similarity, slugify } from "./text.ts";
import { renderTemplate } from "./templates.ts";

export type Record_ = {
  type: "application"; person: string; company: string; role: string; status: ApplicationStatus; updated: string;
  url?: string; source?: string; site?: string; applied?: string; resume?: string; cover_letter?: string;
  requisition?: string; score?: number; follow_up?: string; confirmation?: string; [k: string]: unknown;
};
/** One application directory. `recordError` says why a record.md that is there could not be read. */
export type Application = { dir: string; name: string; recordPath: string | null; record: Record_ | null; postingPath: string | null; posting: Record<string, unknown> | null; recordError?: string };

export const applicationsDir = (person: string, root = repoRoot()) => join(personDir(person, root), "applications");

/** Every application directory of a person, with its record and posting snapshot when present. */
export function listApplications(person: string, root = repoRoot()): Application[] {
  const base = applicationsDir(person, root);
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((d) => statSync(join(base, d)).isDirectory()).sort().map((name) => {
    const dir = join(base, name);
    let recordPath: string | null = null, postingPath: string | null = null;
    let record: Record_ | null = null, posting: Record<string, unknown> | null = null;
    for (const p of walkMarkdown(dir)) {
      const fm = peek(p);
      if (fm?.type === "application" && !recordPath) { recordPath = p; record = fm as Record_; }
      if (fm?.type === "posting" && !postingPath) { postingPath = p; posting = fm; }
    }
    // A record whose frontmatter no longer parses (a hand edit gone wrong) is reported, not silently ignored.
    let recordError: string | undefined;
    const conventional = join(dir, FILE_NAMES.record);
    if (!recordPath && existsSync(conventional)) {
      try {
        readDoc(conventional);
      } catch (e) {
        recordPath = conventional;
        recordError = e instanceof Error ? e.message.split("\n")[0] : String(e);
      }
    }
    return { dir, name, recordPath, record, postingPath, posting, ...(recordError ? { recordError } : {}) };
  });
}

/**
 * The application a reference names: its directory, its name, or its path from the repository root, else the one
 * application whose name contains the reference. A miss lists the nearest names.
 */
export function findApplication(person: string, ref: string, root = repoRoot()): Application {
  const apps = listApplications(person, root);
  const base = ref.replace(/\/+$/, "").split("/").pop() ?? ref;
  const exact = apps.find((a) => a.dir === ref || a.name === base);
  if (exact) return exact;
  const partial = apps.filter((a) => a.name.includes(base));
  if (partial.length === 1) return partial[0];
  const near = (partial.length ? partial : [...apps].sort((x, y) => similarity(y.name.replace(/[_-]/g, " "), base.replace(/[_-]/g, " ")) - similarity(x.name.replace(/[_-]/g, " "), base.replace(/[_-]/g, " ")))).slice(0, 5);
  throw new Error(`${partial.length ? "several" : "no"} applications match ${ref}${near.length ? `; nearest: ${near.map((a) => a.name).join(", ")}` : ""}`);
}

/** Slugs are cut to whole words within a length that keeps paths short on every system. */
const capped = (slug: string, max: number) => (slug.length <= max ? slug : slug.slice(0, max).replace(/-[^-]*$/, "") || slug.slice(0, max));
export const applicationDirName = (date: string, company: string, role: string) => `${date}_${capped(slugify(company), 40)}_${capped(slugify(role), 50)}`;
export const isApplicationDirName = (name: string) => APPLICATION_DIR.test(name);

/**
 * How an earlier application matched: the same link or requisition is the same job; nearly the same posting text
 * (one client's role reposted by several staffing firms) or a similar title is only possibly one.
 */
export type DuplicateMatch = { app: Application; by: "link" | "requisition" | "text" | "title"; similarity?: number };

/** Five-word runs of a text, for comparing two postings' wording. */
function shingles(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 5 <= words.length; i++) out.add(words.slice(i, i + 5).join(" "));
  return out;
}

/** How much of two postings' wording is the same (Jaccard over five-word runs), 0..1. */
export function textSimilarity(a: string, b: string): number {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  return inter / (A.size + B.size - inter);
}

/** The posting snapshot's text, without its frontmatter and headings. */
const postingText = (app: Application) => {
  if (!app.postingPath) return "";
  try {
    return readDoc(app.postingPath).body.replace(/^#.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
  } catch {
    return "";
  }
};

const hostOf = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * An earlier application for the same job. The same link (the record's employer link or the job-board link it was
 * found through) is the same job, and so is the same requisition at the same employer. The same employer with a
 * near-identical title is a possible duplicate (`by: "title"`), for the agent to judge from the postings, unless
 * something already tells them apart: different requisitions, different employer links on the same site, or a
 * record that was skipped, since screening one posting out says nothing about another.
 */
export function findDuplicate(person: string, job: { company?: string; role?: string; url?: string; source?: string; requisition?: string; description?: string }, root = repoRoot()): DuplicateMatch | null {
  const links = [job.url, job.source].filter((u): u is string => !!u).map(normalizeUrl);
  const company = job.company ? normalizeCompany(job.company) : null;
  let possible: DuplicateMatch | null = null;
  let reposted: DuplicateMatch | null = null;
  for (const app of listApplications(person, root)) {
    const r = app.record;
    if (!r) continue;
    const recordLinks = [r.url, r.source].filter(Boolean).map((u) => normalizeUrl(String(u)));
    if (links.some((l) => recordLinks.includes(l))) return { app, by: "link" };
    const sameCompany = company !== null && normalizeCompany(String(r.company)) === company;
    if (job.requisition && r.requisition && String(r.requisition) === job.requisition && (sameCompany || company === null)) return { app, by: "requisition" };
    // The same posting text under another firm's name: one end client's role, reposted by several staffing firms.
    if (!reposted && job.description && job.description.length > 200) {
      const s = textSimilarity(job.description, postingText(app));
      if (s >= 0.7) reposted = { app, by: "text", similarity: Math.round(s * 100) / 100 };
    }
    if (possible || !sameCompany || !job.role || r.status === "skipped") continue;
    if (job.requisition && r.requisition) continue;
    const otherEmployerLink = job.url && r.url && hostOf(job.url) !== "" && hostOf(job.url) === hostOf(String(r.url)) && normalizeUrl(job.url) !== normalizeUrl(String(r.url));
    if (otherEmployerLink) continue;
    const s = similarity(String(r.role), job.role);
    if (s >= 0.6) possible = { app, by: "title", similarity: Math.round(s * 100) / 100 };
  }
  return reposted ?? possible;
}

/** One line on an earlier application, for the agent to compare against the posting in hand. */
export function describeApplication(app: Application): string {
  const r = app.record;
  if (!r) return app.name;
  const parts = [`${r.company} — ${r.role}`, `status ${r.status}`, `since ${r.applied ?? r.updated ?? app.name.slice(0, 10)}`];
  if (r.requisition) parts.push(`requisition ${r.requisition}`);
  if (r.url) parts.push(`link ${r.url}`);
  if (r.source && r.source !== r.url) parts.push(`found at ${r.source}`);
  return parts.join("; ");
}

export type NewApplication = {
  company: string; role: string; url?: string; source?: string; site?: string; requisition?: string; date?: string; status?: ApplicationStatus;
  /** The posting as captured: its full text, and the details `pay` and screening read. */
  description?: string; posted?: string; location?: string; arrangement?: string; pay_min?: number; pay_max?: number; pay_period?: string;
};

/**
 * Creates an application directory with record and posting snapshot rendered from the templates. A directory of the
 * same name refuses, unless `distinct` says the caller knows this is another job (then the name gets -2, -3, ...).
 */
export function createApplication(person: string, job: NewApplication, root = repoRoot(), opts: { distinct?: boolean } = {}): Application {
  const date = job.date ?? today();
  const name = applicationDirName(date, job.company, job.role);
  let dir = join(applicationsDir(person, root), name);
  for (let n = 2; existsSync(dir) && opts.distinct; n++) dir = join(applicationsDir(person, root), `${name}-${n}`);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  mkdirSync(dir, { recursive: true });
  const ctx = { person, date, status: job.status ?? "drafted", ...job };
  writeFileSync(join(dir, FILE_NAMES.record), renderTemplate("application-record", ctx, person, root));
  writeFileSync(join(dir, FILE_NAMES.posting), renderTemplate("posting", ctx, person, root));
  return listApplications(person, root).find((a) => a.dir === dir)!;
}

export function loadRecord(app: Application) {
  if (!app.recordPath) throw new Error(`${app.dir}: no application record`);
  if (app.recordError) throw new Error(`${app.recordPath}: the frontmatter does not parse (${app.recordError}); fix the YAML (a duplicated key is the usual cause)`);
  return readDoc<Record_>(app.recordPath);
}
