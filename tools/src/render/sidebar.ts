// The "sidebar" layout: a narrow side column (name, contact, and by default skills and education)
// beside a main column (summary and experience), as one borderless table row so both columns start
// at the top. The side column comes first in the document, so a parser reading in document order
// meets the name and contact details first. A tinted panel behind the side column lives in the page
// header, so it repeats on every page.
//
// Parsers that read a PDF in visual order can interleave the two columns, so themes with this
// layout are marked `ats: caution`: use them where a person reads the resume first.
import { BorderStyle, Header, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import { exactLine, LAYER, shape } from "./decor.ts";
import { type Block, type Contact, link, type ResumeContent, type Section, type SectionKind, section, styled } from "./docx.ts";
import { color, textWidth, type Theme } from "./theme.ts";

const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" };

const kindOf = (s: Section): SectionKind =>
  s.paragraph ? "paragraph" : s.labeled?.length ? "labeled" : s.lines?.length ? "lines" : "entries";

/** Whether a section goes in the side column: its own `place`, else the theme's list of side kinds. */
export const isSide = (theme: Theme, s: Section): boolean => (s.place ? s.place === "side" : theme.sidebar.sections.includes(kindOf(s)));

function cell(width: number, children: Block[]): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
    children: children.length ? children : [new Paragraph({ children: [] })],
  });
}

function contactBlock(theme: Theme, items: Contact[]): Paragraph[] {
  return items.map((it, i) => new Paragraph({
    spacing: { after: i === items.length - 1 ? 160 : 40 },
    children: [it.url
      ? link(theme, it.text, it.url, theme.sizes.contact, theme.header.contact.linkColor)
      : new TextRun({ text: it.text, font: theme.font, size: theme.sizes.contact, color: color(theme, theme.header.contact.color) })],
  }));
}

export function sidebarLayout(theme: Theme, c: ResumeContent): { children: Block[]; headers?: { default: Header } } {
  const sb = theme.sidebar;
  const sideW = sb.width, gap = sb.gap, mainW = textWidth(theme) - sideW - gap;
  const h = theme.header;

  const side: Paragraph[] = [
    new Paragraph({ spacing: { after: theme.spacing.name.after }, children: [styled(theme, c.name, h.name, theme.sizes.name, theme.fonts.name)] }),
    ...(c.headline ? [new Paragraph({ spacing: { after: theme.spacing.headline.after + 120 }, children: [styled(theme, c.headline, h.headline, theme.sizes.headline, theme.fonts.heading)] })] : []),
    ...contactBlock(theme, c.contact),
  ];
  const main: Paragraph[] = [];
  for (const s of c.sections) {
    if (isSide(theme, s)) side.push(...section(theme, s, sideW, { headingStyle: sb.headingStyle, stacked: true, borders: true }));
    else main.push(...section(theme, s, mainW, { borders: true }));
  }

  const table = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: sideW + gap + mainW, type: WidthType.DXA },
    columnWidths: [sideW, gap, mainW],
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [cell(sideW, side), cell(gap, []), cell(mainW, main)] })],
  });

  if (!sb.panel) return { children: [table] };
  const top = theme.margins.resume.top / 20, bottom = theme.margins.resume.bottom / 20, pad = sb.padding;
  const panel = shape(theme, {
    x: theme.page.marginX / 20 - pad, y: top - pad,
    w: sideW / 20 + 2 * pad, h: theme.page.height / 20 - top - bottom + 2 * pad,
  }, theme.colors.tint, { horizontal: "page", vertical: "page" }, "sidebar panel", LAYER.panel);
  const headers = { default: new Header({ children: [new Paragraph({ spacing: { after: 0, ...exactLine(1) }, children: [panel, new TextRun({ text: "", size: 2 })] })] }) };
  return { children: [table], headers };
}
