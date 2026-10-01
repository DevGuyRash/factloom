// Renders a cover-letter Markdown file into <Name>_Cover_Letter.docx (+ .pdf when LibreOffice is
// available) beside it, using the same header and theme as the resumes.
// Usage: resumes letter <letter.md>
//
// The letter lives under people/<person>/; that person's profile (type: profile) supplies the
// name and contact line. The body is paragraphs separated by blank lines, one line each except
// where a line break is wanted (such as the sign-off).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Packer, Paragraph, TextRun } from "docx";
import { letterProblems } from "../checks/cover-letter-lint.ts";
import type { Command } from "../lib/command.ts";
import { parse } from "../lib/frontmatter.ts";
import { findOne, personOf, repoRoot } from "../lib/repo.ts";
import { DATE } from "../lib/schema.ts";
import { buildDocument, header, runs, toPdf, type Contact } from "../render/docx.ts";
import { findDocInDir, loadVariant, variantPath } from "../render/spec.ts";
import { DEFAULT_THEME, loadTheme, type Theme } from "../render/theme.ts";

function readFrontmatter(file: string): { data: Record<string, unknown>; body: string } {
  const { data, body } = parse(readFileSync(file, "utf8"));
  if (!data) throw new Error(`${file}: missing frontmatter`);
  return { data, body };
}

function contactLine(p: Record<string, unknown>): Contact[] {
  const items: Contact[] = [];
  if (p.location) items.push({ text: String(p.location) });
  if (p.phone) items.push({ text: String(p.phone), url: `tel:+1${String(p.phone).replace(/\D/g, "").slice(-10)}` });
  if (p.email) items.push({ text: String(p.email), url: `mailto:${p.email}` });
  for (const url of (p.links as string[] | undefined) ?? []) items.push({ text: url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), url });
  return items;
}

/** `YYYY-MM-DD` (schema.ts `DATE`) to "Month D, YYYY"; defaults to today when the value is empty. */
function longDate(value: unknown): string {
  const s = value === undefined || value === null || value === "" ? new Date().toLocaleDateString("en-CA") : String(value);
  if (!DATE.test(s)) throw new Error(`date must be YYYY-MM-DD, got ${JSON.stringify(s)}`);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`date ${s} is not a calendar date`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** The theme for a letter: its `theme` field, else the application's resume variant's theme and style, else the default. */
function letterTheme(letter: Record<string, unknown>, record: Record<string, unknown> | undefined, person: string, root: string): Theme {
  if (typeof letter.theme === "string") return loadTheme(letter.theme, root, { person });
  const variantName = typeof record?.resume === "string" ? record.resume : undefined;
  if (variantName && existsSync(variantPath(person, variantName, root))) {
    const v = loadVariant(person, variantName, root);
    return loadTheme(v.theme, root, { person, overrides: v.style });
  }
  return loadTheme(DEFAULT_THEME, root, { person });
}

/** Renders one cover letter; returns the written file paths (docx, and pdf when available). */
export async function buildLetter(letterPath: string, root = repoRoot()): Promise<string[]> {
  const abs = resolve(letterPath);
  const { data: letter, body } = readFrontmatter(abs);
  const { person, dir } = personOf(abs);
  if (letter.person && letter.person !== person) throw new Error(`${abs}: person ${String(letter.person)} does not match its directory ${person}`);
  // The same rules as `resumes check`, so a letter that would fail the check is never rendered.
  const record = findDocInDir(dirname(abs), "application");
  const problems = letterProblems({ rel: relative(root, abs), body, data: letter, record: record?.data, person, root });
  if (problems.length) throw new Error(`${problems.join("\n")}\nfix the letter, then render it again`);
  const profilePath = findOne(person, "profile", root);
  if (!profilePath) throw new Error(`${dir}: no profile found for ${person}`);
  const profile = readFrontmatter(profilePath).data;
  const dateLine = longDate(letter.date);
  // The letter matches the resume sent with it: its own `theme`, else the theme of the application's resume variant.
  const theme = letterTheme(letter, record?.data, person, root);

  const para = (children: TextRun[], after = theme.letter.paragraphAfter) => new Paragraph({ spacing: { after, line: theme.letter.lineSpacing }, children });
  const text = (t: string, opts: { bold?: boolean } = {}) => new TextRun({ text: t, font: theme.font, size: theme.letter.bodySize, color: theme.colors.ink, ...opts });
  // Blank lines separate paragraphs; a line break inside a paragraph is kept (sign-offs, addresses).
  const blocks = body.trim().split(/\r?\n\s*\r?\n/).map((b) => b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const blockRuns = (lines: string[]) => lines.flatMap((l, i) => [...(i ? [new TextRun({ break: 1 })] : []), ...runs(theme, l, { text: "", size: theme.letter.bodySize })]);

  const name = String(profile.name ?? "");
  const children = [
    ...header(theme, { name, contact: contactLine(profile) }, { top: theme.margins.letter.top }),
    para([text(dateLine)], theme.letter.dateAfter),
    ...(letter.company ? [para([text(String(letter.company), { bold: true })], letter.role ? theme.letter.companyAfterWithRole : theme.letter.companyAfterNoRole)] : []),
    ...(letter.role ? [para([text(`Re: ${String(letter.role)}`)], theme.letter.roleAfter)] : []),
    ...blocks.map((b) => para(blockRuns(b))),
  ];
  const doc = buildDocument(theme, { name, title: `${name} Cover Letter`, description: String(letter.role ?? ""), children, margins: theme.margins.letter });
  const out = join(dirname(abs), `${name.replace(/\s+/g, "_")}_Cover_Letter.docx`);
  writeFileSync(out, await Packer.toBuffer(doc));
  const pdf = toPdf(out);
  return pdf ? [out, pdf] : [out];
}

const command: Command = {
  name: "letter",
  summary: "Render a cover-letter Markdown file into a .docx (+ .pdf) using the person's profile and theme",
  usage: "resumes letter <letter.md>",
  async run(argv) {
    const file = argv[0];
    if (!file) { console.error("usage: resumes letter <letter.md>"); return 2; }
    try {
      const files = await buildLetter(file);
      for (const f of files) console.log(`wrote ${f}`);
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  },
};
export default command;
