import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import Handlebars from "handlebars";
import { searchDirs } from "./layers.ts";
import { personDir, repoRoot, sharedDir } from "./repo.ts";
import { slugify } from "./text.ts";

/**
 * Document templates are Handlebars Markdown files named `<name>.md.hbs`, looked up most specific
 * first: a person's own `people/<person>/templates/`, then `custom/templates/documents/`, then the
 * engine's `shared/templates/documents/`. Changing a template changes every document generated
 * from it afterwards.
 */
export const sharedTemplatesDir = (root = repoRoot()) => join(sharedDir(root), "templates", "documents");
export const personTemplatesDir = (person: string, root = repoRoot()) => join(personDir(person, root), "templates");

function engine(root: string, person?: string): typeof Handlebars {
  const hb = Handlebars.create();
  hb.registerHelper("longDate", (d: unknown) => {
    const s = typeof d === "string" && d ? d : new Date().toLocaleDateString("en-CA");
    const dt = new Date(`${s.slice(0, 10)}T12:00:00`);
    return Number.isNaN(dt.getTime()) ? s : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  });
  hb.registerHelper("today", () => new Date().toLocaleDateString("en-CA"));
  hb.registerHelper("slug", (s: unknown) => slugify(String(s ?? "")));
  hb.registerHelper("join", (a: unknown, sep: unknown) => (Array.isArray(a) ? a.join(typeof sep === "string" ? sep : ", ") : ""));
  hb.registerHelper("default", (v: unknown, d: unknown) => (v === undefined || v === null || v === "" ? d : v));
  hb.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  hb.registerHelper("upper", (s: unknown) => String(s ?? "").toUpperCase());
  hb.registerHelper("yaml", (v: unknown) => new hb.SafeString(JSON.stringify(v ?? "")));
  hb.registerHelper("concat", (...args: unknown[]) => args.slice(0, -1).map((v) => String(v ?? "")).join(""));
  hb.registerHelper("bare", (u: unknown) => String(u ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
  // Partials: registered least specific first, so custom/ and then the person's own override shared ones.
  const partialDirs = searchDirs("templates/documents/partials", root, person, "templates/partials").reverse();
  for (const dir of partialDirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".hbs")) hb.registerPartial(basename(f).replace(/\.(md\.)?hbs$/, ""), readFileSync(join(dir, f), "utf8"));
  }
  return hb;
}

/** The path of template `name` for `person`: their override when present, else the shared template. */
export function resolveTemplate(name: string, person?: string, root = repoRoot()): string {
  // "cover-letter" is a Markdown template (cover-letter.md.hbs); "facts.yaml" names its own extension (facts.yaml.hbs).
  const file = name.endsWith(".hbs") ? name : /\.[a-z]+$/.test(name) ? `${name}.hbs` : `${name}.md.hbs`;
  const candidates = searchDirs("templates/documents", root, person).map((d) => join(d, file));
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error(`template ${file} not found (looked in ${candidates.join(", ")})`);
  return hit;
}

export function listTemplates(person?: string, root = repoRoot()): string[] {
  const names = new Set<string>();
  for (const dir of searchDirs("templates/documents", root, person)) {
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".hbs")) names.add(f.replace(/\.md\.hbs$/, "").replace(/\.hbs$/, ""));
  }
  return [...names].sort();
}

/** Renders template `name` with `context`; Markdown output, HTML escaping off. */
export function renderTemplate(name: string, context: Record<string, unknown>, person?: string, root = repoRoot()): string {
  const hb = engine(root, person);
  const tpl = hb.compile(readFileSync(resolveTemplate(name, person, root), "utf8"), { noEscape: true, strict: false });
  return tpl(context);
}
