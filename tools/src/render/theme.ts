// Themes: every style value (fonts, colors, sizes, spacing, shapes, layout) lives in a theme file
// (YAML or JSON) under a templates/themes directory, never in code. A theme may `extends:` another
// and change only what differs; a person (people/<person>/templates/themes/), the repository's
// custom/ layer, and a variant's `style:` block can each override any value without copying the rest.
//
// Units follow Word: sizes are half-points (21 = 10.5 pt), spacing and page measures are twips
// (1/20 pt; 1440 = 1 inch), `tracking` is twips of extra letter spacing, and shape measures
// (`radius`, `padding`) are points.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import YAML from "yaml";
import { searchDirs } from "../lib/layers.ts";
import { repoRoot } from "../lib/repo.ts";

export type Case = "none" | "upper" | "smallcaps";
/** A color: a palette name (accent, ink, muted, rule, tint, link) or a 6-digit hex value. */
export type ColorRef = string;
export type TextStyle = { case: Case; bold: boolean; italic: boolean; tracking: number; color: ColorRef };

export const LAYOUTS = ["flow", "sidebar"] as const;
export const HEADING_STYLES = ["rule", "rules", "band", "bar", "underbar", "plain"] as const;
export const HEADER_RULES = ["single", "double", "thick", "none"] as const;
export const CORNERS = ["square", "rounded"] as const;
export const SECTION_KINDS = ["paragraph", "labeled", "entries", "lines"] as const;
export const PALETTE = ["accent", "ink", "muted", "rule", "tint", "link"] as const;

export type Theme = {
  name: string;
  description: string;
  /** flow: one column, top to bottom. sidebar: a side column beside the main one (harder for ATS parsers). */
  layout: (typeof LAYOUTS)[number];
  /** safe: parses cleanly in applicant tracking systems. caution: humans first (email, networking, print). */
  ats: "safe" | "caution";
  /** Body font; kept for older theme files. Same as fonts.body. */
  font: string;
  fonts: { body: string; heading: string; name: string };
  colors: { accent: string; ink: string; muted: string; rule: string; tint: string; link: string };
  corners: (typeof CORNERS)[number];
  radius: number;
  sizes: { name: number; headline: number; contact: number; sectionHeading: number; entryTitle: number; entrySub: number; body: number; bullet: number };
  page: { width: number; height: number; marginX: number };
  margins: { resume: { top: number; bottom: number }; letter: { top: number; bottom: number } };
  spacing: {
    name: { after: number }; headline: { after: number }; contact: { after: number };
    sectionHeading: { before: number; after: number }; bullet: { after: number; line: number };
    entryTitleBefore: number; entrySubAfter: number;
    paragraph: { after: number; line: number }; labeled: { after: number; line: number }; lines: { after: number };
  };
  borders: { header: { size: number; space: number }; sectionHeading: { size: number; space: number } };
  /** char "auto" picks • for rounded corners and ▪ for square ones. */
  bulletList: { char: string; indentLeft: number; hanging: number; color: ColorRef };
  letter: {
    bodySize: number; lineSpacing: number; paragraphAfter: number; dateAfter: number;
    companyAfterWithRole: number; companyAfterNoRole: number; roleAfter: number;
  };
  header: {
    align: "left" | "center";
    /** A tinted panel behind the name, headline, and contact lines (rounded or square per `corners`). */
    panel: boolean;
    padding: number;
    rule: (typeof HEADER_RULES)[number];
    ruleColor: ColorRef;
    name: TextStyle;
    headline: TextStyle;
    contact: { color: ColorRef; separator: string; separatorColor: ColorRef; linkColor: ColorRef };
  };
  headings: TextStyle & { style: (typeof HEADING_STYLES)[number]; align: "left" | "center"; ruleColor: ColorRef; barColor: ColorRef };
  entries: { dates: "right" | "inline"; title: TextStyle; sub: TextStyle; date: TextStyle; separator: string };
  labeled: { style: "inline" | "stacked"; label: TextStyle };
  lines: { left: TextStyle; right: TextStyle };
  sidebar: { width: number; gap: number; panel: boolean; padding: number; sections: (typeof SECTION_KINDS)[number][]; headingStyle: (typeof HEADING_STYLES)[number] };
};

const text = (over: Partial<TextStyle> = {}): TextStyle => ({ case: "none", bold: false, italic: false, tracking: 0, color: "ink", ...over });

/**
 * Every value a theme can set, with the value used when the theme leaves it out. The defaults
 * reproduce the original single-column layout, so older theme files render exactly as before.
 */
export const DEFAULTS: Omit<Theme, "name"> = {
  description: "",
  layout: "flow",
  ats: "safe",
  font: "Arial",
  fonts: { body: "", heading: "", name: "" },
  colors: { accent: "1870B0", ink: "212529", muted: "5A6069", rule: "", tint: "EEF2F6", link: "" },
  corners: "square",
  radius: 6,
  sizes: { name: 48, headline: 24, contact: 19, sectionHeading: 21, entryTitle: 20, entrySub: 19, body: 19, bullet: 19 },
  page: { width: 12240, height: 15840, marginX: 806 },
  margins: { resume: { top: 620, bottom: 620 }, letter: { top: 720, bottom: 720 } },
  spacing: {
    name: { after: 0 }, headline: { after: 40 }, contact: { after: 60 },
    sectionHeading: { before: 130, after: 50 }, bullet: { after: 25, line: 245 },
    entryTitleBefore: 70, entrySubAfter: 30,
    paragraph: { after: 40, line: 250 }, labeled: { after: 30, line: 245 }, lines: { after: 30 },
  },
  borders: { header: { size: 12, space: 4 }, sectionHeading: { size: 8, space: 1 } },
  bulletList: { char: "auto", indentLeft: 260, hanging: 180, color: "accent" },
  letter: { bodySize: 21, lineSpacing: 276, paragraphAfter: 160, dateAfter: 200, companyAfterWithRole: 0, companyAfterNoRole: 200, roleAfter: 200 },
  header: {
    align: "left", panel: false, padding: 10, rule: "single", ruleColor: "rule",
    name: text({ bold: true, color: "accent" }),
    headline: text({ bold: true }),
    contact: { color: "ink", separator: "  |  ", separatorColor: "muted", linkColor: "link" },
  },
  headings: { ...text({ case: "upper", bold: true, color: "accent" }), style: "rule", align: "left", ruleColor: "rule", barColor: "accent" },
  entries: { dates: "right", title: text({ bold: true, color: "accent" }), sub: text({ bold: true }), date: text({ bold: true }), separator: "  |  " },
  labeled: { style: "inline", label: text({ bold: true }) },
  lines: { left: text({ bold: true }), right: text({ bold: true }) },
  sidebar: { width: 3300, gap: 400, panel: true, padding: 12, sections: ["labeled", "lines"], headingStyle: "underbar" },
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Objects merge key by key; arrays and scalars replace. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out && isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : v;
  return out as T;
}

export const THEME_EXTENSIONS = [".yaml", ".yml", ".json"];

/** The theme used when nothing names one. */
export const DEFAULT_THEME = "classic-blue";

/** Where theme files are looked up, most specific first. */
export const themeDirs = (root = repoRoot(), person?: string): string[] => searchDirs("templates/themes", root, person);

/** The file for theme `name`, or undefined. */
export function themePath(name: string, root = repoRoot(), person?: string): string | undefined {
  for (const dir of themeDirs(root, person)) {
    for (const ext of THEME_EXTENSIONS) {
      const p = join(dir, `${name}${ext}`);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

function readThemeFile(path: string): Plain {
  let data: unknown;
  try {
    data = YAML.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path}: not valid YAML/JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!isPlain(data)) throw new Error(`${path}: a theme file must be a mapping of settings`);
  return data;
}

/** The raw settings of `name` with its `extends` chain applied (parents first), before defaults. */
export function rawTheme(name: string, root = repoRoot(), person?: string, seen: string[] = []): Plain {
  if (seen.includes(name)) throw new Error(`theme ${name} extends itself (${[...seen, name].join(" -> ")})`);
  const path = themePath(name, root, person);
  if (!path) throw new Error(`theme not found: ${name} (looked in ${themeDirs(root, person).join(", ")}); \`resumes themes list\` shows the available themes`);
  const own = readThemeFile(path);
  const parent = typeof own.extends === "string" ? rawTheme(own.extends, root, person, [...seen, name]) : {};
  const { extends: _parent, ...rest } = own;
  return deepMerge(parent, rest);
}

const HEX = /^#?[0-9a-fA-F]{6}$/;
const hex = (v: string) => v.replace(/^#/, "").toUpperCase();

/**
 * YAML reads an unquoted all-digit color such as 404040 as a number; turn those back into hex text.
 * Anything else that is not text (such as 123E45, read as 1.23e47) is left for validation to report.
 */
function coerceColor(v: unknown): unknown {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 999999 ? String(v).padStart(6, "0") : v;
}

/** Applies coerceColor to every color setting in a raw theme, in place. */
function coerceColors(t: Theme): void {
  for (const k of Object.keys(t.colors) as (keyof Theme["colors"])[]) t.colors[k] = coerceColor(t.colors[k]) as string;
  const refs: [Record<string, unknown>, string][] = [
    [t.header, "ruleColor"], [t.header.contact, "color"], [t.header.contact, "separatorColor"], [t.header.contact, "linkColor"],
    [t.headings, "ruleColor"], [t.headings, "barColor"], [t.bulletList, "color"],
    ...[t.header.name, t.header.headline, t.headings, t.entries.title, t.entries.sub, t.entries.date, t.labeled.label, t.lines.left, t.lines.right].map((s) => [s, "color"] as [Record<string, unknown>, string]),
  ];
  for (const [obj, key] of refs) if (obj && key in obj) obj[key] = coerceColor(obj[key]);
}

/** Every key path a theme may set (taken from DEFAULTS), so a misspelled key is reported instead of ignored. */
function knownKeys(obj: Plain = DEFAULTS as unknown as Plain, prefix = ""): Set<string> {
  const out = new Set<string>(prefix ? [] : ["name", "extends"]);
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p);
    if (isPlain(v)) for (const sub of knownKeys(v, p)) out.add(sub);
  }
  return out;
}
const KNOWN = knownKeys();

function unknownKeys(obj: Plain, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (!KNOWN.has(p)) out.push(p);
    else if (isPlain(v)) out.push(...unknownKeys(v, p));
  }
  return out;
}

function oneOf<T extends string>(path: string, value: unknown, allowed: readonly T[], errors: string[]): void {
  if (!allowed.includes(value as T)) errors.push(`${path} is ${JSON.stringify(value)}; use one of ${allowed.join(", ")}`);
}

function checkColorRef(path: string, value: unknown, errors: string[]): void {
  if (typeof value !== "string" || !(HEX.test(value) || (PALETTE as readonly string[]).includes(value))) {
    const hint = typeof value === "number" ? ` (YAML read it as a number; put it in quotes)` : "";
    errors.push(`${path} is ${JSON.stringify(value)}; use a 6-digit hex color (such as 1870B0) or one of ${PALETTE.join(", ")}${hint}`);
  }
}

/** Fills defaults, derives dependent values, normalizes colors, and reports every problem at once. */
export function resolveTheme(name: string, raw: Plain): Theme {
  const unknown = unknownKeys(raw);
  const t = deepMerge({ ...DEFAULTS, name } as Theme, raw);
  t.name = name;
  const errors: string[] = unknown.map((k) => `unknown setting ${k} (\`resumes themes show classic-blue\` lists every setting)`);

  // Derived defaults: one font fills every role it is not given; rule and link colors follow the accent.
  t.fonts = { body: t.fonts.body || t.font, heading: t.fonts.heading || t.fonts.body || t.font, name: t.fonts.name || t.fonts.heading || t.fonts.body || t.font };
  t.font = t.fonts.body;
  coerceColors(t);
  const quoteHint = (v: unknown) => (typeof v === "number" ? ` (YAML read it as a number; put it in quotes: "${String(v)}")` : "");
  for (const k of ["accent", "ink", "muted", "tint"] as const) {
    if (typeof t.colors[k] !== "string" || !HEX.test(t.colors[k])) errors.push(`colors.${k} is ${JSON.stringify(t.colors[k])}; use a 6-digit hex color such as 1870B0${quoteHint(t.colors[k])}`);
    else t.colors[k] = hex(t.colors[k]);
  }
  for (const k of ["rule", "link"] as const) {
    if (!t.colors[k]) t.colors[k] = t.colors.accent;
    else if (typeof t.colors[k] !== "string" || !HEX.test(t.colors[k])) errors.push(`colors.${k} is ${JSON.stringify(t.colors[k])}; use a 6-digit hex color${quoteHint(t.colors[k])}`);
    else t.colors[k] = hex(t.colors[k]);
  }
  if (t.bulletList.char === "auto") t.bulletList.char = t.corners === "rounded" ? "•" : "▪";

  oneOf("layout", t.layout, LAYOUTS, errors);
  oneOf("ats", t.ats, ["safe", "caution"] as const, errors);
  oneOf("corners", t.corners, CORNERS, errors);
  oneOf("header.align", t.header.align, ["left", "center"] as const, errors);
  oneOf("header.rule", t.header.rule, HEADER_RULES, errors);
  oneOf("headings.style", t.headings.style, HEADING_STYLES, errors);
  oneOf("headings.align", t.headings.align, ["left", "center"] as const, errors);
  oneOf("entries.dates", t.entries.dates, ["right", "inline"] as const, errors);
  oneOf("labeled.style", t.labeled.style, ["inline", "stacked"] as const, errors);
  oneOf("sidebar.headingStyle", t.sidebar.headingStyle, HEADING_STYLES, errors);
  if (!Array.isArray(t.sidebar.sections) || t.sidebar.sections.some((s) => !(SECTION_KINDS as readonly string[]).includes(s))) {
    errors.push(`sidebar.sections must list section kinds from ${SECTION_KINDS.join(", ")}`);
  }
  const styles: [string, TextStyle][] = [
    ["header.name", t.header.name], ["header.headline", t.header.headline], ["headings", t.headings],
    ["entries.title", t.entries.title], ["entries.sub", t.entries.sub], ["entries.date", t.entries.date],
    ["labeled.label", t.labeled.label], ["lines.left", t.lines.left], ["lines.right", t.lines.right],
  ];
  for (const [path, s] of styles) {
    oneOf(`${path}.case`, s.case, ["none", "upper", "smallcaps"] as const, errors);
    checkColorRef(`${path}.color`, s.color, errors);
    if (typeof s.tracking !== "number") errors.push(`${path}.tracking must be a number (twips of extra letter spacing)`);
  }
  for (const [path, v] of [["header.ruleColor", t.header.ruleColor], ["header.contact.color", t.header.contact.color], ["header.contact.separatorColor", t.header.contact.separatorColor], ["header.contact.linkColor", t.header.contact.linkColor], ["headings.ruleColor", t.headings.ruleColor], ["headings.barColor", t.headings.barColor], ["bulletList.color", t.bulletList.color]] as const) {
    checkColorRef(path, v, errors);
  }
  if (!(t.radius >= 0)) errors.push("radius must be zero or more (points)");
  if (errors.length) throw new Error(`theme ${name} has problems:\n  - ${errors.join("\n  - ")}`);
  return t;
}

/**
 * Loads theme `name` for `person` (their own themes first, then custom/, then the defaults), applies
 * its `extends` chain, then `overrides` (such as a variant's `style:` block), and fills defaults.
 */
export function loadTheme(name: string, root = repoRoot(), opts: { person?: string; overrides?: unknown } = {}): Theme {
  const raw = rawTheme(name, root, opts.person);
  return resolveTheme(name, isPlain(opts.overrides) ? deepMerge(raw, opts.overrides) : raw);
}

export type ThemeInfo = { name: string; path: string; description: string; layout: string; ats: string; shadows: string[] };

/** Every theme visible to `person`, with where it comes from; `shadows` lists the files it overrides. */
export function listThemes(root = repoRoot(), person?: string): ThemeInfo[] {
  const seen = new Map<string, ThemeInfo>();
  for (const dir of themeDirs(root, person)) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      const ext = THEME_EXTENSIONS.find((e) => f.endsWith(e));
      if (!ext) continue;
      const name = basename(f, ext);
      const path = join(dir, f);
      const prior = seen.get(name);
      if (prior) { prior.shadows.push(path); continue; }
      let info = { description: "", layout: "flow", ats: "safe" };
      try {
        const raw = rawTheme(name, root, person);
        info = { description: String(raw.description ?? ""), layout: String(raw.layout ?? "flow"), ats: String(raw.ats ?? "safe") };
      } catch (e) {
        info.description = `(cannot load: ${e instanceof Error ? e.message.split("\n")[0] : String(e)})`;
      }
      seen.set(name, { name, path, ...info, shadows: [] });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A palette name or hex value, as the 6-digit hex Word needs. */
export function color(theme: Theme, ref: ColorRef): string {
  return (PALETTE as readonly string[]).includes(ref) ? theme.colors[ref as (typeof PALETTE)[number]] : hex(ref);
}

/** The text width inside the page margins, in twips — used for right tab stops. */
export const textWidth = (theme: Theme): number => theme.page.width - 2 * theme.page.marginX;
