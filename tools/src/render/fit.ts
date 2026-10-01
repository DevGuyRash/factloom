// Fitting a resume to a page count. A variant may set `pages: N`; when the rendered PDF runs longer,
// the build retries with progressively tighter settings (spacing first, then type size, then
// margins) and keeps the first that fits. Body text never goes below 9 pt. Without LibreOffice there
// is no PDF to measure, so the resume is written as designed.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { writeResume, type ResumeContent } from "./docx.ts";
import type { Theme } from "./theme.ts";

const MIN_BODY = 18; // half-points: 9 pt

type Step = { label: string; spacing: number; shrink: number; margins: number };
export const FIT_STEPS: Step[] = [
  { label: "as designed", spacing: 1, shrink: 0, margins: 1 },
  { label: "spacing 85%", spacing: 0.85, shrink: 0, margins: 1 },
  { label: "spacing 70%", spacing: 0.7, shrink: 0, margins: 1 },
  { label: "spacing 70%, type -0.5 pt", spacing: 0.7, shrink: 1, margins: 1 },
  { label: "spacing 70%, type -0.5 pt, margins 85%", spacing: 0.7, shrink: 1, margins: 0.85 },
  { label: "spacing 60%, type -1 pt, margins 80%", spacing: 0.6, shrink: 2, margins: 0.8 },
];

const scale = (v: number, f: number) => Math.round(v * f);

/** The theme with spacing scaled, text sizes reduced by `shrink` half-points (body never below 9 pt), and margins scaled. */
export function tighten(theme: Theme, step: Step): Theme {
  if (step.spacing === 1 && step.shrink === 0 && step.margins === 1) return theme;
  const t: Theme = structuredClone(theme);
  const sp = t.spacing, f = step.spacing;
  sp.name.after = scale(sp.name.after, f); sp.headline.after = scale(sp.headline.after, f); sp.contact.after = scale(sp.contact.after, f);
  sp.sectionHeading = { before: scale(sp.sectionHeading.before, f), after: scale(sp.sectionHeading.after, f) };
  sp.bullet = { after: scale(sp.bullet.after, f), line: Math.max(228, scale(sp.bullet.line, 0.5 + f / 2)) };
  sp.entryTitleBefore = scale(sp.entryTitleBefore, f); sp.entrySubAfter = scale(sp.entrySubAfter, f);
  sp.paragraph = { after: scale(sp.paragraph.after, f), line: Math.max(228, scale(sp.paragraph.line, 0.5 + f / 2)) };
  sp.labeled = { after: scale(sp.labeled.after, f), line: Math.max(228, scale(sp.labeled.line, 0.5 + f / 2)) };
  sp.lines.after = scale(sp.lines.after, f);
  const sz = t.sizes, d = step.shrink;
  const body = Math.max(MIN_BODY, sz.body - d);
  const shrunk = sz.body - body; // never shrink more than the body allows
  for (const k of ["headline", "contact", "sectionHeading", "entryTitle", "entrySub", "bullet"] as const) sz[k] = Math.max(MIN_BODY - 1, sz[k] - shrunk);
  sz.body = body;
  sz.name = sz.name - 2 * shrunk;
  t.margins.resume = { top: scale(t.margins.resume.top, step.margins), bottom: scale(t.margins.resume.bottom, step.margins) };
  t.page.marginX = scale(t.page.marginX, step.margins);
  return t;
}

/** The page count of a PDF: pdfinfo when present, else counting page objects. */
export function pageCount(pdf: string): number {
  const r = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
  const m = r.status === 0 ? r.stdout.match(/^Pages:\s+(\d+)/m) : null;
  if (m) return Number(m[1]);
  return (readFileSync(pdf, "latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export type FitResult = { files: string[]; pages?: number; step?: string; fits?: boolean };

/** Writes the resume, tightening it step by step until it fits in `pages` (when given and measurable). */
export async function writeFitted(theme: Theme, content: ResumeContent, dir: string, baseName: string, pages?: number): Promise<FitResult> {
  let last: FitResult = { files: [] };
  for (const step of pages ? FIT_STEPS : FIT_STEPS.slice(0, 1)) {
    const files = await writeResume(tighten(theme, step), content, dir, baseName);
    const pdf = files.find((f) => f.endsWith(".pdf"));
    if (!pdf) return { files };
    const count = pageCount(pdf);
    last = { files, pages: count, step: step.label, fits: !pages || count <= pages };
    if (last.fits) return last;
  }
  return last;
}
