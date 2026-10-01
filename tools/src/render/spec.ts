// Loads a person's facts.yaml (content SSOT) and a variant YAML (structure: which facts, in what
// order, under which headings) and resolves them into the plain ResumeContent that docx.ts
// renders. Keeps content, structure, and style (theme.ts) as three separate, swappable layers.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { peek } from "../lib/frontmatter.ts";
import { personDir, repoRoot, walkMarkdown } from "../lib/repo.ts";
import type { Contact, Entry, Line, ResumeContent, Section } from "./docx.ts";

/** The first Markdown file of `type` directly under an application (or other) directory
 * (keywords and tailor both need this; kept here once instead of duplicated per command). */
export function findDocInDir(dir: string, type: string): { path: string; data: Record<string, unknown> } | null {
  for (const p of walkMarkdown(dir)) {
    const fm = peek(p);
    if (fm?.type === type) return { path: p, data: fm };
  }
  return null;
}

export type BulletFact = { text: string; keywords?: string[]; confirm?: string[] };
export type EntryFact = { title: string; sub?: string; dates?: string; link?: { text: string; url: string }; bullets: BulletFact[] };
export type LineFact = { left: string; rest?: string; right?: string };
export type Facts = {
  person: string;
  name: string;
  contact: Contact[];
  skills: Record<string, { label: string; items: string }>;
  projects: Record<string, EntryFact>;
  jobs: Record<string, EntryFact>;
  lines: Record<string, LineFact>;
};

export type VariantEntryRef = { project?: string; job?: string; bullets?: number[]; title?: string };
type Placement = { title: string; place?: "side" | "main" };
export type VariantSection =
  | (Placement & { paragraph: string })
  | (Placement & { labeled: string[] })
  | (Placement & { entries: VariantEntryRef[] })
  | (Placement & { lines: string[] });
/**
 * A layout: which facts, in what order, under which headings. `style` overrides any theme setting for
 * this variant only; `pages` is the most pages it may take (the build tightens spacing to fit).
 */
export type Variant = { variant: string; theme: string; headline: string; output: string; sections: VariantSection[]; style?: Record<string, unknown>; pages?: number };

export const sourceDir = (person: string, root = repoRoot()) => join(personDir(person, root), "resumes", "source");
export const factsPath = (person: string, root = repoRoot()) => join(sourceDir(person, root), "facts.yaml");
export const variantsDir = (person: string, root = repoRoot()) => join(sourceDir(person, root), "variants");
export const variantPath = (person: string, name: string, root = repoRoot()) => join(variantsDir(person, root), `${name}.yaml`);

export function loadFacts(person: string, root = repoRoot()): Facts {
  return YAML.parse(readFileSync(factsPath(person, root), "utf8")) as Facts;
}

export function listVariants(person: string, root = repoRoot()): string[] {
  const dir = variantsDir(person, root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort();
}

export function loadVariant(person: string, name: string, root = repoRoot()): Variant {
  const p = variantPath(person, name, root);
  if (!existsSync(p)) throw new Error(`no variant ${name} for ${person} (looked at ${p})`);
  return YAML.parse(readFileSync(p, "utf8")) as Variant;
}

export function entryFactOf(facts: Facts, ref: VariantEntryRef): { fact: EntryFact; id: string } {
  const id = ref.project ?? ref.job;
  if (!id) throw new Error(`entry reference is missing both project and job: ${JSON.stringify(ref)}`);
  const fact = ref.project ? facts.projects[id] : facts.jobs[id];
  if (!fact) throw new Error(`no ${ref.project ? "project" : "job"} named ${id} in facts`);
  return { fact, id };
}

/** The bullet facts an entry reference actually uses, in the order the variant picked. */
export function pickBullets(fact: EntryFact, ref: VariantEntryRef): BulletFact[] {
  if (!ref.bullets) return fact.bullets;
  return ref.bullets.map((i) => {
    const b = fact.bullets[i];
    if (!b) throw new Error(`bullet index ${i} out of range for ${JSON.stringify(fact.title)}`);
    return b;
  });
}

function entryOf(facts: Facts, ref: VariantEntryRef): Entry {
  const { fact } = entryFactOf(facts, ref);
  const bullets = pickBullets(fact, ref).map((b) => b.text);
  return { title: ref.title ?? fact.title, ...(fact.sub ? { sub: fact.sub } : {}), ...(fact.dates ? { dates: fact.dates } : {}), ...(fact.link ? { link: fact.link } : {}), bullets };
}

function lineOf(facts: Facts, id: string): Line {
  const l = facts.lines[id];
  if (!l) throw new Error(`no line named ${id} in facts`);
  return l;
}

function labeledOf(facts: Facts, id: string): [string, string] {
  const s = facts.skills[id];
  if (!s) throw new Error(`no skill named ${id} in facts`);
  return [s.label, s.items];
}

export function sectionOf(facts: Facts, vs: VariantSection): Section {
  const place = vs.place ? { place: vs.place } : {};
  if ("paragraph" in vs) return { title: vs.title, paragraph: vs.paragraph, ...place };
  if ("labeled" in vs) return { title: vs.title, labeled: vs.labeled.map((id) => labeledOf(facts, id)), ...place };
  if ("entries" in vs) return { title: vs.title, entries: vs.entries.map((e) => entryOf(facts, e)), ...place };
  return { title: vs.title, lines: vs.lines.map((id) => lineOf(facts, id)), ...place };
}

/** Resolves a variant against facts into the plain content object docx.ts renders. */
export function resolveContent(facts: Facts, variant: Variant): ResumeContent {
  return { name: facts.name, headline: variant.headline, contact: facts.contact, sections: variant.sections.map((s) => sectionOf(facts, s)) };
}

/** Every fact's text, flattened for keyword scanning: skill items, project/job titles and
 * bullets, and one-line entries. Broader than any single resume variant. */
export function factsText(facts: Facts): string {
  const entryText = (e: EntryFact) => [e.title, e.sub ?? "", ...e.bullets.map((b) => b.text)].join("\n");
  const parts: string[] = [];
  for (const s of Object.values(facts.skills ?? {})) parts.push(s.label, s.items);
  for (const e of Object.values(facts.projects ?? {})) parts.push(entryText(e));
  for (const e of Object.values(facts.jobs ?? {})) parts.push(entryText(e));
  for (const l of Object.values(facts.lines ?? {})) parts.push(l.left, l.rest ?? "", l.right ?? "");
  return parts.join("\n");
}

/** A resolved resume's text, flattened for keyword scanning (what the reader of that resume sees). */
export function contentText(content: ResumeContent): string {
  const parts: string[] = [content.name, content.headline ?? ""];
  for (const s of content.sections) {
    parts.push(s.title);
    if (s.paragraph) parts.push(s.paragraph);
    for (const [label, items] of s.labeled ?? []) parts.push(label, items);
    for (const b of s.bullets ?? []) parts.push(b);
    for (const e of s.entries ?? []) parts.push(e.title, e.sub ?? "", ...(e.bullets ?? []));
    for (const l of s.lines ?? []) parts.push(l.left, l.rest ?? "", l.right ?? "");
  }
  return parts.join("\n");
}

/** Every `confirm` phrase anywhere in the facts, used by a variant or not: text no letter may repeat until the person confirms it. */
export function allConfirms(facts: Facts): string[] {
  const entries = [...Object.values(facts.projects ?? {}), ...Object.values(facts.jobs ?? {})];
  return [...new Set(entries.flatMap((e) => (e?.bullets ?? []).flatMap((b) => b?.confirm ?? [])))].filter((p) => typeof p === "string" && p.length > 0);
}

/** The `confirm` phrases of every bullet a variant actually uses (for guide review derivation). */
export function confirmsUsed(facts: Facts, variant: Variant): string[] {
  const out: string[] = [];
  for (const vs of variant.sections) {
    if (!("entries" in vs)) continue;
    for (const ref of vs.entries) {
      const { fact } = entryFactOf(facts, ref);
      for (const b of pickBullets(fact, ref)) if (b.confirm) out.push(...b.confirm);
    }
  }
  return [...new Set(out)];
}
