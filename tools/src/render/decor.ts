// Decorative shapes (panels, bands, bars) and exact line heights. Shapes are native Word drawings,
// floating behind the text, so applicant tracking systems read the text exactly as if they were not
// there; they never hold text and only ever sit behind dark text on light fills, so a viewer that
// drops drawings still shows a readable resume.
//
// Placement rules, chosen from what Word and LibreOffice agree on: page-level shapes are positioned
// against the page; shapes beside a heading are positioned against the heading's own line and its
// first character (never "paragraph", whose top includes the space before it in LibreOffice), which
// also keeps them inside the right column of a table.
import { HorizontalPositionRelativeFrom, LineRuleType, TextWrappingType, VerticalPositionRelativeFrom } from "docx";
import { ShapeRun } from "docx/shapes";
import type { Theme } from "./theme.ts";

const PX_PER_PT = 96 / 72;
const EMU_PER_PT = 12700;

export type Box = { x: number; y: number; w: number; h: number };
type Anchor = { horizontal: "page" | "character"; vertical: "page" | "line" };

/** Stacking order for Word: page panels lowest, decorations beside text above them. */
export const LAYER = { panel: 1, decoration: 2 } as const;

/** A filled rectangle (rounded when the theme's corners are) floating behind the text. Measures in points. */
export function shape(theme: Theme, box: Box, fill: string, anchor: Anchor, name = "decoration", layer: number = LAYER.decoration): ShapeRun {
  const rounded = theme.corners === "rounded" && theme.radius > 0;
  const shorter = Math.max(1, Math.min(box.w, box.h));
  return new ShapeRun({
    ...(rounded
      ? { type: "roundedRectangle" as const, adjustments: { cornerRadius: Math.min(50, (theme.radius / shorter) * 100) } }
      : { type: "rectangle" as const }),
    transformation: { width: Math.round(box.w * PX_PER_PT), height: Math.round(box.h * PX_PER_PT) },
    fill,
    line: "none",
    altText: { name, description: "decoration", title: "" },
    floating: {
      horizontalPosition: {
        relative: anchor.horizontal === "page" ? HorizontalPositionRelativeFrom.PAGE : HorizontalPositionRelativeFrom.CHARACTER,
        offset: Math.round(box.x * EMU_PER_PT),
      },
      verticalPosition: {
        relative: anchor.vertical === "page" ? VerticalPositionRelativeFrom.PAGE : VerticalPositionRelativeFrom.LINE,
        offset: Math.round(box.y * EMU_PER_PT),
      },
      behindDocument: true,
      allowOverlap: true,
      lockAnchor: true,
      layoutInCell: true,
      wrap: { type: TextWrappingType.NONE },
      zIndex: layer,
    },
  });
}

/** Paragraph spacing with an exact line height in points (so shapes can be sized to the text exactly). */
export const exactLine = (pt: number): { line: number; lineRule: (typeof LineRuleType)["EXACT"] } => ({ line: Math.round(pt * 20), lineRule: LineRuleType.EXACT });

/** Line height that clears a font's ascenders and descenders, in points, for a size in half-points. */
export const lineFor = (halfPoints: number, factor = 1.28): number => Math.ceil((halfPoints / 2) * factor);

// Average character width as a share of the font size, measured on mixed-case text. Used only to
// decide whether a header line fits on one line; an unknown font gets a wide estimate.
const AVG_CHAR: Record<string, number> = {
  calibri: 0.49, "calibri light": 0.48, arial: 0.55, helvetica: 0.55, "liberation sans": 0.55, georgia: 0.56, cambria: 0.53,
  "times new roman": 0.47, "trebuchet ms": 0.53, verdana: 0.62, tahoma: 0.53, "segoe ui": 0.53, garamond: 0.46,
  "palatino linotype": 0.53, candara: 0.5, corbel: 0.5, constantia: 0.53, "franklin gothic medium": 0.52,
};

/** Estimated width in points of `text` in `font` at `halfPoints`, padded so the estimate errs wide. */
export function estimateWidth(text: string, font: string, halfPoints: number, tracking = 0): number {
  const per = AVG_CHAR[font.toLowerCase()] ?? 0.6;
  return text.length * ((halfPoints / 2) * per + tracking / 20) * 1.08;
}
