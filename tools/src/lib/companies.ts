// Company dossiers: custom/companies/<slug>.md, one per company, type "company". SSOT for company
// facts drafts and interview prep can pull from, so every person's drafts agree on the same company.
// They are the repository's own research, so they live in custom/, which engine updates never touch.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { peek, readDoc } from "./frontmatter.ts";
import { customDir } from "./layers.ts";
import { repoRoot } from "./repo.ts";
import { renderTemplate } from "./templates.ts";
import { slugify } from "./text.ts";

export type CompanyDoc = { type: "company"; company: string; website?: string; updated: string; [k: string]: unknown };
export type Company = { path: string; slug: string; data: CompanyDoc };

export const companiesDir = (root = repoRoot()) => join(customDir(root), "companies");

/** Every company dossier, sorted by company name. */
export function listCompanies(root = repoRoot()): Company[] {
  const dir = companiesDir(root);
  if (!existsSync(dir)) return [];
  const out: Company[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const path = join(dir, f);
    const fm = peek(path);
    if (fm?.type === "company") out.push({ path, slug: f.replace(/\.md$/, ""), data: fm as CompanyDoc });
  }
  return out.sort((a, b) => String(a.data.company).localeCompare(String(b.data.company)));
}

/** The dossier whose company name matches (slug-insensitive), or null. */
export function findCompany(name: string, root = repoRoot()): Company | null {
  const slug = slugify(name);
  return listCompanies(root).find((c) => c.slug === slug || slugify(String(c.data.company)) === slug) ?? null;
}

/** Creates shared/companies/<slug>.md from the company-dossier template. Throws if one already exists. */
export function createCompany(name: string, opts: { website?: string } = {}, root = repoRoot()): Company {
  const existing = findCompany(name, root);
  if (existing) throw new Error(`a dossier for ${name} already exists at ${existing.path}`);
  const dir = companiesDir(root);
  mkdirSync(dir, { recursive: true });
  const slug = slugify(name);
  const path = join(dir, `${slug}.md`);
  const text = renderTemplate("company-dossier", { company: name, website: opts.website, date: new Date().toLocaleDateString("en-CA") }, undefined, root);
  writeFileSync(path, text);
  return { path, slug, data: readDoc<CompanyDoc>(path).data };
}
