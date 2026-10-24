// Loads a person's facts.yaml (content SSOT) and a variant YAML (structure: which facts, in what
// order, under which headings) and resolves them into the plain ResumeContent that docx.ts
// renders. Keeps content, structure, and style (theme.ts) as three separate, swappable layers.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

export type EvidenceRefs = { sources?: string[]; confirmed_by?: string[] };
export type BulletFact = EvidenceRefs & { text: string; keywords?: string[]; confirm?: string[] };
export type EntryFact = EvidenceRefs & { title: string; sub?: string; dates?: string; link?: { text: string; url: string }; bullets: BulletFact[] };
export type LineFact = EvidenceRefs & { left: string; rest?: string; right?: string };
/** Reviewed prose projections, not primary evidence. Channels are explicit destination names. */
export type SummaryCopy = { text: string; fact_refs: string[]; confirm?: string[]; reviewed?: string };
export type NamedSummary = { channels: Record<string, SummaryCopy> };
export type Facts = {
  person: string;
  mode?: "genuine_career" | "synthetic_research";
  batch_id?: string;
  name: string;
  contact: Contact[];
  skills: Record<string, EvidenceRefs & { label: string; items: string }>;
  projects: Record<string, EntryFact>;
  jobs: Record<string, EntryFact>;
  lines: Record<string, LineFact>;
  summaries?: Record<string, NamedSummary>;
};

export type VariantEntryRef = { project?: string; job?: string; bullets?: number[]; title?: string };
type Placement = { title: string; place?: "side" | "main" };
export type VariantSection =
  | (Placement & { paragraph: string })
  | (Placement & { summary: string; channel?: string })
  | (Placement & { labeled: string[] })
  | (Placement & { entries: VariantEntryRef[] })
  | (Placement & { lines: string[] });
/**
 * A layout: which facts, in what order, under which headings. `style` overrides any theme setting for
 * this variant only; `pages` is the most pages it may take (the build tightens spacing to fit).
 */
export type Variant = { mode?: "genuine_career" | "synthetic_research"; batch_id?: string; variant: string; theme: string; headline: string; output: string; sections: VariantSection[]; style?: Record<string, unknown>; pages?: number };

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
  validateSection(vs);
  const place = vs.place ? { place: vs.place } : {};
  if ("summary" in vs) return { title: vs.title, paragraph: resolveSummary(facts, vs.summary, vs.channel).text, ...place };
  if ("paragraph" in vs) return { title: vs.title, paragraph: vs.paragraph, ...place };
  if ("labeled" in vs) return { title: vs.title, labeled: vs.labeled.map((id) => labeledOf(facts, id)), ...place };
  if ("entries" in vs) return { title: vs.title, entries: vs.entries.map((e) => entryOf(facts, e)), ...place };
  return { title: vs.title, lines: vs.lines.map((id) => lineOf(facts, id)), ...place };
}

/** Resolves a variant against facts into the plain content object docx.ts renders. */
export function resolveContent(facts: Facts, variant: Variant): ResumeContent {
  return { name: facts.name, headline: variant.headline, contact: facts.contact, sections: variant.sections.map((s) => sectionOf(facts, s)) };
}

/** Stable source references for reviewing the full inventory, independently of a selection. */
export type FactEvidence = { id: string; text: string; state: "confirmed" | "unconfirmed"; sources: string[]; confirmedBy: string[] };
export function factEvidence(facts: Facts): FactEvidence[] {
  const out: FactEvidence[] = [];
  const refs = (value: unknown, id: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(x => typeof x !== "string" || !x.trim())) throw new Error(`${id}: evidence references must be nonempty strings`);
    return value;
  };
  const add = (id: string, text: string, evidence: EvidenceRefs, held = false) => out.push({ id, text, state: held ? "unconfirmed" : "confirmed", sources: refs(evidence.sources, id), confirmedBy: refs(evidence.confirmed_by, id) });
  for (const [id, s] of Object.entries(facts.skills ?? {})) add(`skills.${id}`, `${s.label}: ${s.items}`, s);
  for (const kind of ["projects", "jobs"] as const) for (const [id, e] of Object.entries(facts[kind] ?? {})) {
    add(`${kind}.${id}.title`, [e.title, e.sub, e.dates].filter(Boolean).join("\n"), e);
    for (const [i, bullet] of e.bullets.entries()) add(`${kind}.${id}.bullets.${i}`, bullet.text, bullet, !!bullet.confirm?.length);
  }
  for (const [id, l] of Object.entries(facts.lines ?? {})) add(`lines.${id}`, [l.left, l.rest, l.right].filter(Boolean).join(" "), l);
  return out;
}

/** Confirmed source text by default. A held flag remains held until reconciled in the source. */
export function factsText(facts: Facts, opts: { includeUnconfirmed?: boolean } = {}): string {
  return factEvidence(facts).filter(f => opts.includeUnconfirmed || f.state === "confirmed").map(f => f.text).join("\n");
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
    validateSection(vs);
    if ("summary" in vs) {
      const summary = resolveSummary(facts, vs.summary, vs.channel);
      out.push(...summary.holds);
      if (summary.review_status !== "current") out.push(`Review summary ${summary.summary}/${summary.channel}: ${summary.review_status} review`);
    }
    if (!("entries" in vs)) continue;
    for (const ref of vs.entries) {
      const { fact } = entryFactOf(facts, ref);
      for (const b of pickBullets(fact, ref)) if (b.confirm) out.push(...b.confirm);
    }
  }
  return [...new Set(out)];
}

function validateSection(section: VariantSection): void {
  if (!section || typeof section !== "object" || ["paragraph", "summary", "labeled", "entries", "lines"].filter(k => Object.hasOwn(section, k)).length !== 1) {
    throw new Error("section must select exactly one of paragraph, summary, labeled, entries, or lines");
  }
  if ("channel" in section && !("summary" in section)) throw new Error("section channel requires a summary reference");
}

export type ResolvedSummary = {
  summary: string; channel: string; text: string; fact_refs: string[]; digest: string;
  review_status: "missing" | "stale" | "current"; holds: string[]; evidence: FactEvidence[];
  identity: { mode: Facts["mode"] | "unknown"; batch_id: string | null };
  support_context: { fact_ref: string; context: unknown }[];
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const own = (v: unknown, key: string): unknown => object(v) && Object.hasOwn(v, key) ? v[key] : undefined;
function strings(v: unknown, label: string, required = false): string[] {
  if (v === undefined && !required) return [];
  if (!Array.isArray(v) || (required && !v.length) || v.some(x => typeof x !== "string" || !x.trim()) || new Set(v).size !== v.length) {
    throw new Error(`${label} must contain distinct nonempty strings`);
  }
  return v;
}

/** One deterministic projection for rendering, inspection, export and review. Never generates prose. */
export function resolveSummary(facts: Facts, id: string, channel = "resume"): ResolvedSummary {
  if (typeof id !== "string" || !id.trim() || typeof channel !== "string" || !channel.trim()) throw new Error("summary id and channel must be nonempty strings");
  const summary = own(facts.summaries, id);
  if (!object(summary)) throw new Error(`no summary named ${id}`);
  const copy = own(summary.channels, channel);
  if (!object(copy)) throw new Error(`summary ${id} has no channel ${channel}`);
  if (typeof copy.text !== "string" || !copy.text.trim()) throw new Error(`summary ${id}/${channel} needs nonempty text`);
  const refs = strings(copy.fact_refs, `summary ${id}/${channel} fact_refs`, true);
  const confirm = strings(copy.confirm, `summary ${id}/${channel} confirm`);
  if (copy.reviewed !== undefined && (typeof copy.reviewed !== "string" || !/^[a-f0-9]{64}$/.test(copy.reviewed))) throw new Error(`summary ${id}/${channel} reviewed must be a SHA-256 digest from summary inspect`);
  const primary = new Map(factEvidence(facts).map(f => [f.id, f]));
  const evidence = refs.map(ref => {
    const fact = primary.get(ref);
    if (!fact) throw new Error(`summary ${id}/${channel}: unknown primary fact ${ref}`);
    return fact;
  });
  const contexts = new Map<string, unknown>();
  for (const kind of ["jobs", "projects"] as const) for (const [key, entry] of Object.entries(facts[kind] ?? {})) {
    const context = { title: entry.title, sub: entry.sub ?? null, dates: entry.dates ?? null,
      link: entry.link ? { text: entry.link.text, url: entry.link.url } : null,
      sources: entry.sources ?? [], confirmed_by: entry.confirmed_by ?? [] };
    contexts.set(`${kind}.${key}.title`, context);
    entry.bullets.forEach((bullet, index) => contexts.set(`${kind}.${key}.bullets.${index}`, { context, confirm: bullet.confirm ?? [] }));
  }
  // Ordered refs protect against positional bullet IDs changing meaning. Attribution and holds
  // are part of the review, too; adding a stamp itself must not change its digest.
  const support = evidence.map(fact => ({ fact, context: contexts.get(fact.id) ?? null }));
  // Missing legacy identity remains unknown, never silently certified as genuine.
  const digest = createHash("sha256").update(JSON.stringify({ version: 1, person: facts.person, mode: facts.mode ?? null, batch_id: facts.batch_id ?? null, summary: id, channel, text: copy.text, confirm, support })).digest("hex");
  return { summary: id, channel, text: copy.text, fact_refs: refs, digest,
    identity: { mode: facts.mode ?? "unknown", batch_id: facts.batch_id ?? null },
    support_context: support.map(s => ({ fact_ref: s.fact.id, context: s.context })),
    review_status: copy.reviewed === undefined ? "missing" : copy.reviewed === digest ? "current" : "stale",
    holds: [...confirm, ...evidence.filter(f => f.state === "unconfirmed").map(f => `Summary ${id}/${channel} uses unconfirmed ${f.id}`)], evidence };
}
