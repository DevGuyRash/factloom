// Themes: list them, show every resolved setting, preview a resume in each, scaffold a new one that
// extends an existing theme, and check colors and fonts. Theme files are YAML or JSON; see theme.ts.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { customDir } from "../lib/layers.ts";
import { personDir, rel, repoRoot, resolvePerson } from "../lib/repo.ts";
import { writeFitted } from "../render/fit.ts";
import { listVariants, loadFacts, loadVariant, resolveContent } from "../render/spec.ts";
import { color, listThemes, loadTheme, rawTheme, themePath, type Theme } from "../render/theme.ts";

/** WCAG relative luminance of a 6-digit hex color. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two 6-digit hex colors (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Readability problems: text colors against the backgrounds they sit on (WCAG AA: 4.5 for text, 3 for large headings). */
export function contrastProblems(t: Theme): string[] {
  const out: string[] = [];
  const need = (what: string, fg: string, bg: string, min: number) => {
    const r = contrast(fg, bg);
    if (r < min) out.push(`${what}: contrast ${r.toFixed(2)}:1 is below ${min}:1 (#${fg} on #${bg})`);
  };
  const white = "FFFFFF";
  need("body text (colors.ink)", t.colors.ink, white, 4.5);
  need("secondary text (colors.muted)", t.colors.muted, white, 4.5);
  need("links (colors.link)", t.colors.link, white, 4.5);
  need("section headings", color(t, t.headings.color), t.headings.style === "band" ? t.colors.tint : white, 3);
  need("entry titles", color(t, t.entries.title.color), white, 4.5);
  const headerBg = t.header.panel ? t.colors.tint : white;
  need("name", color(t, t.header.name.color), headerBg, 3);
  need("headline", color(t, t.header.headline.color), headerBg, 4.5);
  need("contact line", color(t, t.header.contact.color), headerBg, 4.5);
  if (t.layout === "sidebar" && t.sidebar.panel) need("side column text", t.colors.ink, t.colors.tint, 4.5);
  return out;
}

/** Fonts the theme names that this machine lacks (PDFs rendered here would use a substitute). */
export function missingFonts(t: Theme): { font: string; substitute: string }[] {
  const out: { font: string; substitute: string }[] = [];
  for (const font of new Set([t.fonts.body, t.fonts.heading, t.fonts.name])) {
    const r = spawnSync("fc-match", [font, "family"], { encoding: "utf8" });
    if (r.status !== 0) continue; // no fontconfig (Windows, macOS without it): nothing to compare
    const names = r.stdout.trim().split(",").map((s) => s.trim());
    if (!names.some((n) => n.toLowerCase() === font.toLowerCase())) out.push({ font, substitute: names[0] });
  }
  return out;
}

function list(person: string | undefined, root: string): number {
  for (const t of listThemes(root, person)) {
    console.log(`${t.name.padEnd(14)} ${t.layout.padEnd(8)} ats:${t.ats.padEnd(8)} ${t.description}`);
    console.log(`${"".padEnd(14)} ${rel(t.path, root)}${t.shadows.length ? `  (overrides ${t.shadows.map((s) => rel(s, root)).join(", ")})` : ""}`);
  }
  return 0;
}

function show(name: string, person: string | undefined, root: string): number {
  const t = loadTheme(name, root, { person });
  console.log(`# ${name}: every setting after \`extends\` and defaults (${rel(themePath(name, root, person) ?? "", root)})`);
  console.log(YAML.stringify(t, { lineWidth: 0 }).trimEnd());
  return 0;
}

function check(names: string[], person: string | undefined, root: string): number {
  const targets = names.length ? names : listThemes(root, person).map((t) => t.name);
  let errors = 0;
  for (const name of targets) {
    let t: Theme;
    try {
      t = loadTheme(name, root, { person });
    } catch (e) {
      errors++;
      console.log(`✗ ${name}\n  ${(e instanceof Error ? e.message : String(e)).replace(/\n/g, "\n  ")}`);
      continue;
    }
    const notes = [
      ...contrastProblems(t).map((p) => `warning: ${p}`),
      ...missingFonts(t).map((m) => `note: ${m.font} is not installed here; PDFs made on this machine use ${m.substitute} (Word users who have ${m.font} see it as designed)`),
      ...(t.ats === "caution" ? ["note: ats: caution — some applicant tracking systems misread this layout; use an ats: safe theme for job-portal uploads"] : []),
    ];
    console.log(`${notes.some((n) => n.startsWith("warning")) ? "!" : "✓"} ${name}${notes.length ? `\n  ${notes.join("\n  ")}` : ""}`);
  }
  return errors ? 1 : 0;
}

async function preview(a: ReturnType<typeof parseArgs>, root: string): Promise<number> {
  const person = resolvePerson(flag(a, "person"), root);
  const variantName = flag(a, "variant") ?? listVariants(person, root)[0];
  if (!variantName) { console.error(`${person} has no resume variants (resumes/source/variants/)`); return 1; }
  const out = resolve(flag(a, "out") ?? join(tmpdir(), "resumes-previews", `${person}-${variantName}`));
  const names = flag(a, "themes")?.split(",").map((s) => s.trim()).filter(Boolean) ?? listThemes(root, person).map((t) => t.name);
  const facts = loadFacts(person, root);
  const variant = loadVariant(person, variantName, root);
  const content = resolveContent(facts, variant);
  const png = has(a, "png");
  for (const name of names) {
    const theme = loadTheme(name, root, { person, overrides: has(a, "with-style") ? variant.style : undefined });
    const fit = await writeFitted(theme, content, join(out, name), variant.output, has(a, "fit") ? variant.pages : undefined);
    const files = fit.files;
    const pdf = files.find((f) => f.endsWith(".pdf"));
    if (fit.pages !== undefined) console.log(`${name}: ${fit.pages} page(s)${fit.step && fit.step !== "as designed" ? ` (${fit.step})` : ""}`);
    if (png && pdf) {
      const prefix = join(out, `${name}`);
      const r = spawnSync("pdftoppm", ["-png", "-r", flag(a, "dpi") ?? "60", "-f", "1", "-l", "1", "-singlefile", pdf, prefix], { stdio: "ignore" });
      if (r.status === 0) files.push(`${prefix}.png`);
    }
    for (const f of files) console.log(`wrote ${f}`);
  }
  return 0;
}

const SCAFFOLD = (name: string, from: string) => `# ${name}: starts from ${from} and changes only what is listed here. \`resumes themes show ${from}\`
# prints every setting you can override; delete the examples you do not want.
extends: ${from}
description: ${from} with my changes.

# colors:
#   accent: "0F766E"      # headings, titles, bullets (keep contrast with white at 4.5:1 or more)
#   ink: "1F2933"         # body text
#   muted: "52606D"       # dates, separators, secondary text
#   tint: "E6F4F1"        # panels and bands behind text
# fonts: { body: Calibri, heading: Calibri, name: Calibri Light }
# corners: rounded        # rounded or square, for panels, bands, bars, and the default bullet
# radius: 8               # corner radius in points
# headings: { style: band, case: smallcaps, tracking: 40 }   # rule, rules, band, bar, underbar, plain
# header: { align: center, panel: true }
# sizes: { name: 52, body: 20 }   # half-points: 20 = 10 pt
`;

function scaffold(a: ReturnType<typeof parseArgs>, root: string): number {
  const name = a._[1];
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) { console.error("usage: resumes themes new <name> [--from <theme>] [--person <slug>]  (name: lowercase words joined by hyphens)"); return 2; }
  const from = flag(a, "from") ?? "modern";
  const person = flag(a, "person");
  rawTheme(from, root, person); // fails clearly when the base does not exist
  const dir = person ? join(personDir(person, root), "templates", "themes") : join(customDir(root), "templates", "themes");
  const path = join(dir, `${name}.yaml`);
  if (existsSync(path) && !has(a, "force")) { console.error(`${rel(path, root)} already exists (pass --force to replace it)`); return 1; }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, SCAFFOLD(name, from));
  console.log(`wrote ${rel(path, root)}`);
  console.log(`use it: set \`theme: ${name}\` in a variant, or preview: resumes themes preview --themes ${name},${from}`);
  return 0;
}

const USAGE = "resumes themes list [--person p] | themes show <name> [--person p] | themes check [name ...] [--person p] | themes preview [--person p] [--variant v] [--themes a,b] [--out dir] [--png] [--with-style] [--fit] | themes new <name> [--from theme] [--person p] [--force]";

const command: Command = {
  name: "themes",
  summary: "List, show, check, preview, and create resume themes (colors, fonts, corners, layouts)",
  usage: USAGE,
  async run(argv) {
    const a = parseArgs(argv, ["png", "with-style", "force", "fit"]);
    const root = repoRoot();
    const person = flag(a, "person");
    try {
      switch (a._[0] ?? "list") {
        case "list": return list(person, root);
        case "show": return a._[1] ? show(a._[1], person, root) : (console.error(`usage: ${USAGE}`), 2);
        case "check": return check(a._.slice(1), person, root);
        case "preview": return await preview(a, root);
        case "new": return scaffold(a, root);
        default: console.error(`usage: ${USAGE}`); return 2;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 1;
    }
  },
};
export default command;
