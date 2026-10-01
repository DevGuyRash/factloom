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
export type Application = { dir: string; name: string; recordPath: string | null; record: Record_ | null; postingPath: string | null; posting: Record<string, unknown> | null };

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
    return { dir, name, recordPath, record, postingPath, posting };
  });
}

export const applicationDirName = (date: string, company: string, role: string) => `${date}_${slugify(company)}_${slugify(role)}`;
export const isApplicationDirName = (name: string) => APPLICATION_DIR.test(name);

/** An existing application for the same job: same link or requisition, or same company with a near-identical role. */
export function findDuplicate(person: string, job: { company: string; role: string; url?: string; requisition?: string }, root = repoRoot()): Application | null {
  const url = job.url ? normalizeUrl(job.url) : null;
  const company = normalizeCompany(job.company);
  for (const app of listApplications(person, root)) {
    const r = app.record;
    if (!r) continue;
    if (url && r.url && normalizeUrl(String(r.url)) === url) return app;
    if (job.requisition && r.requisition && String(r.requisition) === job.requisition) return app;
    if (normalizeCompany(String(r.company)) === company && similarity(String(r.role), job.role) >= 0.6) return app;
  }
  return null;
}

export type NewApplication = { company: string; role: string; url?: string; source?: string; site?: string; requisition?: string; date?: string; status?: ApplicationStatus };

/** Creates an application directory with record and posting snapshot rendered from the templates. */
export function createApplication(person: string, job: NewApplication, root = repoRoot()): Application {
  const date = job.date ?? today();
  const name = applicationDirName(date, job.company, job.role);
  const dir = join(applicationsDir(person, root), name);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  mkdirSync(dir, { recursive: true });
  const ctx = { person, date, status: job.status ?? "drafted", ...job };
  writeFileSync(join(dir, FILE_NAMES.record), renderTemplate("application-record", ctx, person, root));
  writeFileSync(join(dir, FILE_NAMES.posting), renderTemplate("posting", ctx, person, root));
  return listApplications(person, root).find((a) => a.dir === dir)!;
}

export function loadRecord(app: Application) {
  if (!app.recordPath) throw new Error(`${app.dir}: no application record`);
  return readDoc<Record_>(app.recordPath);
}
