// Shared renderer: turns a resume (or cover-letter) content object into a .docx. Every style value
// comes from a Theme (theme.ts); the theme's `layout` picks the page structure: "flow" (one column,
// top to bottom, here) or "sidebar" (sidebar.ts). Text is always real paragraphs in reading order;
// decorations (decor.ts) only ever sit behind it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, type Header, LevelFormat, Packer, Paragraph,
  type Table, TabStopType, TextRun,
} from "docx";
import { estimateWidth, exactLine, LAYER, lineFor, shape } from "./decor.ts";
import { color, textWidth, type ColorRef, type TextStyle, type Theme } from "./theme.ts";
import { toPdf } from "./pdf.ts";

export type Contact = { text: string; url?: string };
export type Link = { text: string; url: string };
export type Entry = { title: string; sub?: string; dates?: string; link?: Link; bullets?: string[] };
export type Line = { left: string; rest?: string; right?: string };
export type SectionKind = "paragraph" | "labeled" | "entries" | "lines";
export type Section = {
  title: string; paragraph?: string; labeled?: [string, string][]; bullets?: string[];
  entries?: Entry[]; lines?: Line[];
  /** Sidebar layouts only: put this section in the side column or the main one (default: by kind). */
  place?: "side" | "main";
};
export type ResumeContent = { name: string; headline?: string; contact: Contact[]; sections: Section[] };
export type Block = Paragraph | Table;

type Run = { text: string; bold?: boolean; size?: number; color?: string };

// Inline markup: **bold** segments inside bullet/summary text.
export function runs(theme: Theme, text: string, base: Run = { text: "" }): TextRun[] {
  const out: TextRun[] = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((seg) => {
    if (!seg) return;
    const bold = seg.startsWith("**");
    out.push(new TextRun({
      text: bold ? seg.slice(2, -2) : seg, bold: bold || base.bold,
      font: theme.font, size: base.size ?? theme.sizes.body, color: base.color ?? theme.colors.ink,
    }));
  });
  return out;
}

/** A run in a theme text style; only non-default properties are written. */
export function styled(theme: Theme, text: string, st: TextStyle, size: number, font: string): TextRun {
  return new TextRun({
    text: st.case === "upper" ? text.toUpperCase() : text,
    ...(st.bold ? { bold: true } : {}),
    ...(st.italic ? { italics: true } : {}),
    ...(st.case === "smallcaps" ? { smallCaps: true } : {}),
    ...(st.tracking ? { characterSpacing: st.tracking } : {}),
    font, size, color: color(theme, st.color),
  });
}

export const link = (theme: Theme, text: string, url: string, size?: number, ref: ColorRef = "link"): ExternalHyperlink =>
  new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: theme.font, size: size ?? theme.sizes.contact, color: color(theme, ref) })] });

const center = (on: boolean) => (on ? { alignment: AlignmentType.CENTER } : {});

/** Contact items as lines: one line, or two when a fixed-height header panel needs a known line count. */
function contactLines(theme: Theme, items: Contact[], width: number): Contact[][] {
  if (!theme.header.panel || items.length < 2) return [items];
  const all = items.map((i) => i.text).join(theme.header.contact.separator);
  if (estimateWidth(all, theme.font, theme.sizes.contact) <= width) return [items];
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}

/** Name, headline, and contact line(s); with `header.panel`, a tinted panel sits behind them. */
export function header(theme: Theme, c: { name: string; headline?: string; contact: Contact[] }, opts: { top?: number } = {}): Paragraph[] {
  const h = theme.header;
  const tw = textWidth(theme);
  const sep = () => new TextRun({ text: h.contact.separator, font: theme.font, size: theme.sizes.contact, color: color(theme, h.contact.separatorColor) });
  const item = (it: Contact) => (it.url
    ? link(theme, it.text, it.url, theme.sizes.contact, h.contact.linkColor)
    : new TextRun({ text: it.text, font: theme.font, size: theme.sizes.contact, color: color(theme, h.contact.color) }));
  const ruleStyle = { single: BorderStyle.SINGLE, double: BorderStyle.DOUBLE, thick: BorderStyle.THICK, none: BorderStyle.NONE }[h.rule];
  const rule = h.rule === "none" ? {} : { border: { bottom: { style: ruleStyle, size: theme.borders.header.size, color: color(theme, h.ruleColor), space: theme.borders.header.space } } };
  const lines = contactLines(theme, c.contact, tw / 20);

  // Exact line heights make the header's height known, so a panel can enclose it precisely.
  const panel = h.panel;
  const nameLine = lineFor(theme.sizes.name, 1.22), headLine = lineFor(theme.sizes.headline, 1.3), contactLine = lineFor(theme.sizes.contact, 1.4);
  const exact = (pt: number) => (panel ? exactLine(pt) : {});
  const pad = h.padding;
  const gapAfter = panel ? Math.round(pad * 20) + 120 : 0;

  const out: Paragraph[] = [];
  const nameChildren: (TextRun | ReturnType<typeof shape>)[] = [styled(theme, c.name, h.name, theme.sizes.name, theme.fonts.name)];
  if (panel) {
    const height = nameLine + theme.spacing.name.after / 20 + (c.headline ? headLine + theme.spacing.headline.after / 20 : 0) + lines.length * contactLine;
    const top = (opts.top ?? theme.margins.resume.top) / 20;
    nameChildren.unshift(shape(theme, { x: theme.page.marginX / 20 - pad, y: top - pad, w: tw / 20 + 2 * pad, h: height + 2 * pad }, theme.colors.tint, { horizontal: "page", vertical: "page" }, "header panel", LAYER.panel));
  }
  out.push(new Paragraph({ spacing: { after: theme.spacing.name.after, ...exact(nameLine) }, ...center(h.align === "center"), children: nameChildren }));
  if (c.headline) out.push(new Paragraph({ spacing: { after: theme.spacing.headline.after, ...exact(headLine) }, ...center(h.align === "center"), children: [styled(theme, c.headline, h.headline, theme.sizes.headline, theme.fonts.heading)] }));
  lines.forEach((items, li) => {
    const children: (TextRun | ExternalHyperlink)[] = [];
    items.forEach((it, i) => { if (i) children.push(sep()); children.push(item(it)); });
    const last = li === lines.length - 1;
    out.push(new Paragraph({
      spacing: { after: last ? theme.spacing.contact.after + gapAfter : 0, ...exact(contactLine) },
      ...(last ? rule : {}),
      ...center(h.align === "center"),
      children,
    }));
  });
  return out;
}

/**
 * A section heading in the theme's heading style, sized for a column `colW` twips wide. `borders`
 * draws bars with paragraph borders instead of shapes. The sidebar layout needs it: LibreOffice
 * paints page-header shapes (the panel) over body shapes and drops shapes inside a table row that
 * breaks across pages, but borders are part of the text and always print.
 */
export function heading(theme: Theme, title: string, colW: number, kind: Theme["headings"]["style"] = theme.headings.style, opts: { borders?: boolean } = {}): Paragraph[] {
  const hs = theme.headings;
  if (opts.borders && kind === "band") kind = "rule";
  const run = styled(theme, title, hs, theme.sizes.sectionHeading, theme.fonts.heading);
  const centered = hs.align === "center";
  const sp = theme.spacing.sectionHeading;
  const border = { style: BorderStyle.SINGLE, size: theme.borders.sectionHeading.size, color: color(theme, hs.ruleColor), space: theme.borders.sectionHeading.space };
  const lh = lineFor(theme.sizes.sectionHeading, 1.3);
  switch (kind) {
    case "rule":
      return [new Paragraph({ keepNext: true, spacing: { before: sp.before, after: sp.after }, border: { bottom: border }, ...center(centered), children: [run] })];
    case "rules":
      return [new Paragraph({ keepNext: true, spacing: { before: sp.before, after: sp.after }, border: { top: border, bottom: border }, ...center(centered), children: [run] })];
    case "plain":
      return [new Paragraph({ keepNext: true, spacing: { before: sp.before, after: sp.after }, ...center(centered), children: [run] })];
    case "band": {
      // A tinted band the width of the column behind the heading text, which is inset from its edge.
      const padY = 3, inset = 6;
      const band = shape(theme, { x: -inset, y: -padY, w: colW / 20, h: lh + 2 * padY }, theme.colors.tint, { horizontal: "character", vertical: "line" }, "heading band");
      return [new Paragraph({
        keepNext: true,
        spacing: { before: Math.max(sp.before, (padY + 4) * 20), after: Math.max(sp.after, (padY + 3) * 20), ...exactLine(lh) },
        indent: { left: inset * 20 },
        ...center(centered),
        children: [band, run],
      })];
    }
    case "bar": {
      // A short accent bar just left of the heading text, vertically centered on the line.
      const barW = 3.5, gap = 6, barH = Math.round(lh * 0.62);
      if (opts.borders) {
        const left = { style: BorderStyle.SINGLE, size: Math.round(barW * 8), color: color(theme, hs.barColor), space: gap };
        return [new Paragraph({ keepNext: true, spacing: { before: sp.before, after: sp.after }, indent: { left: Math.round((barW + gap) * 20) }, border: { left }, children: [run] })];
      }
      const bar = shape(theme, { x: -(barW + gap), y: (lh - barH) / 2, w: barW, h: barH }, color(theme, hs.barColor), { horizontal: "character", vertical: "line" }, "heading bar");
      return [new Paragraph({ keepNext: true, spacing: { before: sp.before, after: sp.after, ...exactLine(lh) }, indent: { left: Math.round((barW + gap) * 20) }, children: [bar, run] })];
    }
    case "underbar": {
      // The heading, then a short accent bar under it on a line of its own.
      const barW = 26, barH = 2.5;
      if (opts.borders) {
        // The same bar as a bottom border on an empty paragraph indented to the bar's width.
        const rest = Math.max(0, colW - Math.round(barW * 20));
        return [
          new Paragraph({ keepNext: true, spacing: { before: sp.before, after: 0 }, ...center(centered), children: [run] }),
          new Paragraph({
            keepNext: true, spacing: { after: sp.after, ...exactLine(3) },
            indent: centered ? { left: Math.round(rest / 2), right: Math.round(rest / 2) } : { right: rest },
            border: { bottom: { style: BorderStyle.SINGLE, size: Math.round(barH * 8), color: color(theme, hs.barColor), space: 0 } },
            children: [],
          }),
        ];
      }
      const x = centered ? (colW / 20 - barW) / 2 : 0;
      const bar = shape(theme, { x, y: 0.5, w: barW, h: barH }, color(theme, hs.barColor), { horizontal: "character", vertical: "line" }, "heading underbar");
      return [
        new Paragraph({ keepNext: true, spacing: { before: sp.before, after: 30 }, ...center(centered), children: [run] }),
        new Paragraph({ keepNext: true, spacing: { after: sp.after, ...exactLine(barH + 1.5) }, children: [bar] }),
      ];
    }
  }
}

// The first bullet is kept with the second so a heading never strands at a page bottom with one line.
const bullet = (theme: Theme, text: string, keepNext = false): Paragraph =>
  new Paragraph({ numbering: { reference: "bullets", level: 0 }, keepNext, keepLines: true, spacing: { after: theme.spacing.bullet.after, line: theme.spacing.bullet.line }, children: runs(theme, text) });

// Title on the left with dates right-aligned on the same line (a right tab stop), or inline after it.
function entryLines(theme: Theme, e: Entry, tw: number): Paragraph[] {
  const out: Paragraph[] = [];
  const en = theme.entries;
  const titleRuns: TextRun[] = [styled(theme, e.title, en.title, theme.sizes.entryTitle, theme.fonts.heading)];
  const inline = en.dates === "inline";
  if (e.dates) {
    if (inline) titleRuns.push(new TextRun({ text: en.separator, font: theme.font, size: theme.sizes.entrySub, color: theme.colors.muted }), styled(theme, e.dates, en.date, theme.sizes.entrySub, theme.font));
    else titleRuns.push(styled(theme, `\t${e.dates}`, en.date, theme.sizes.entrySub, theme.font));
  }
  out.push(new Paragraph({ keepNext: true, spacing: { before: theme.spacing.entryTitleBefore, after: 0 }, ...(inline ? {} : { tabStops: [{ type: TabStopType.RIGHT, position: tw }] }), children: titleRuns }));
  if (e.sub) {
    const sub: (TextRun | ExternalHyperlink)[] = en.sub.italic || en.sub.color !== "ink" || en.sub.case !== "none"
      ? [styled(theme, e.sub.replace(/\*\*/g, ""), en.sub, theme.sizes.entrySub, theme.font)]
      : runs(theme, e.sub, { text: "", bold: en.sub.bold || undefined, size: theme.sizes.entrySub });
    if (e.link) sub.push(new TextRun({ text: en.separator, font: theme.font, size: theme.sizes.entrySub, color: theme.colors.muted }), link(theme, e.link.text, e.link.url, theme.sizes.entrySub));
    out.push(new Paragraph({ keepNext: true, spacing: { after: theme.spacing.entrySubAfter }, children: sub }));
  }
  const bs = e.bullets || [];
  bs.forEach((b, i) => out.push(bullet(theme, b, i === 0 && bs.length > 1)));
  return out;
}

/** One section's paragraphs for a column `tw` twips wide; `stacked` puts labels and dates on lines of their own. */
export function section(theme: Theme, s: Section, tw: number, opts: { headingStyle?: Theme["headings"]["style"]; stacked?: boolean; borders?: boolean } = {}): Paragraph[] {
  const out = heading(theme, s.title, tw, opts.headingStyle, { borders: opts.borders });
  const stacked = opts.stacked ?? theme.labeled.style === "stacked";
  if (s.paragraph) out.push(new Paragraph({ spacing: { after: theme.spacing.paragraph.after, line: theme.spacing.paragraph.line }, children: runs(theme, s.paragraph) }));
  (s.labeled || []).forEach(([label, items]) => {
    const labelRun = styled(theme, stacked ? label : `${label}: `, theme.labeled.label, theme.sizes.entrySub, theme.font);
    if (stacked) {
      out.push(new Paragraph({ keepNext: true, spacing: { after: 0 }, children: [labelRun] }));
      out.push(new Paragraph({ spacing: { after: theme.spacing.labeled.after + 40, line: theme.spacing.labeled.line }, children: runs(theme, items) }));
    } else {
      out.push(new Paragraph({ spacing: { after: theme.spacing.labeled.after, line: theme.spacing.labeled.line }, children: [labelRun, ...runs(theme, items)] }));
    }
  });
  (s.bullets || []).forEach((b) => out.push(bullet(theme, b)));
  (s.entries || []).forEach((e) => out.push(...entryLines(theme, e, tw)));
  (s.lines || []).forEach((l) => {
    const left = styled(theme, l.left, theme.lines.left, theme.sizes.entrySub, theme.font);
    if (opts.stacked) {
      out.push(new Paragraph({ keepNext: true, spacing: { after: 0 }, children: [left] }));
      if (l.rest) out.push(new Paragraph({ keepNext: Boolean(l.right), spacing: { after: 0 }, children: runs(theme, l.rest.replace(/^\s*[|,]\s*/, "")) }));
      if (l.right) out.push(new Paragraph({ spacing: { after: 0 }, children: [styled(theme, l.right, theme.lines.right, theme.sizes.entrySub, theme.font)] }));
      out.push(new Paragraph({ spacing: { after: theme.spacing.lines.after + 60, line: 120 }, children: [] }));
      return;
    }
    const r = [left];
    if (l.rest) r.push(...runs(theme, l.rest));
    if (l.right) r.push(styled(theme, `\t${l.right}`, theme.lines.right, theme.sizes.entrySub, theme.font));
    out.push(new Paragraph({ spacing: { after: theme.spacing.lines.after }, tabStops: [{ type: TabStopType.RIGHT, position: tw }], children: r }));
  });
  return out;
}

export type BuildDocOptions = {
  name: string; title: string; description?: string; children: Block[];
  margins?: { top: number; bottom: number };
  /** Page headers (sidebar panels repeat on every page through the default header). */
  headers?: { default: Header };
};

// One page style shared by resumes and cover letters, so both carry the same header.
export function buildDocument(theme: Theme, { name, title, description, children, margins, headers }: BuildDocOptions): Document {
  const m = margins ?? theme.margins.resume;
  return new Document({
    creator: name,
    lastModifiedBy: name,
    title,
    description,
    styles: { default: { document: { run: { font: theme.font, size: theme.sizes.body, color: theme.colors.ink } } } },
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: theme.bulletList.char, alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: theme.bulletList.indentLeft, hanging: theme.bulletList.hanging } }, run: { color: color(theme, theme.bulletList.color), font: theme.font } },
        }],
      }],
    },
    sections: [{
      properties: { page: { size: { width: theme.page.width, height: theme.page.height }, margin: { ...m, left: theme.page.marginX, right: theme.page.marginX, ...(headers ? { header: 200 } : {}) } } },
      ...(headers ? { headers } : {}),
      children,
    }],
  });
}

/** The resume's blocks and page headers for the theme's layout. */
async function layout(theme: Theme, c: ResumeContent): Promise<{ children: Block[]; headers?: { default: Header } }> {
  if (theme.layout === "sidebar") return (await import("./sidebar.ts")).sidebarLayout(theme, c);
  const tw = textWidth(theme);
  return { children: [...header(theme, c), ...c.sections.flatMap((s) => section(theme, s, tw))] };
}

export async function render(theme: Theme, c: ResumeContent, outPath: string): Promise<void> {
  const { children, headers } = await layout(theme, c);
  const doc = buildDocument(theme, { name: c.name, title: `${c.name} Resume`, description: c.headline, children, headers });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, await Packer.toBuffer(doc));
}

export async function writeResume(theme: Theme, c: ResumeContent, dir: string, baseName: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const docx = join(dir, `${baseName}.docx`);
  await render(theme, c, docx);
  const pdf = toPdf(docx);
  return pdf ? [docx, pdf] : [docx];
}

export { toPdf };
