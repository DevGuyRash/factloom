// The floor a resume must clear before anyone reads it: what any reader or parser trips on, whatever the
// person's field or the resume's style. It says nothing about whether the writing is good; that judgment
// belongs to the agent and the person, so nothing here rewrites or ranks content.
import { extractDocumentText } from "../lib/pii.ts";
import type { PipelineConfig } from "../lib/pipeline-config.ts";
import type { ResumeContent } from "./docx.ts";
import { contentText, type Facts, type Variant } from "./spec.ts";

const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|lorem ipsum)\b|\bX{2,}\b|\[(?:[A-Z][a-z]* ?)+\]|<[a-z][^>]*>/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);

/** What falls below the floor, one line each; empty when the resume clears it. */
export function belowFloor(content: ResumeContent, facts: Facts, variant: Variant, floor: PipelineConfig["resume_floor"]): string[] {
  const out: string[] = [];
  const contact = content.contact.map((c) => `${c.text} ${c.url ?? ""}`).join(" ");
  if (!/@/.test(contact) && !/mailto:/.test(contact)) out.push("the contact block has no email address");
  if (!content.headline?.trim()) out.push("no headline under the name");
  for (const s of content.sections) {
    const shown = s.paragraph?.trim() || s.labeled?.length || s.bullets?.length || s.entries?.length || s.lines?.length;
    if (!shown) out.push(`section "${s.title}" is empty`);
    for (const e of s.entries ?? []) {
      const n = e.bullets?.length ?? 0;
      if (n < floor.bullets_per_entry) out.push(`"${clip(e.title)}" has ${n} bullet${n === 1 ? "" : "s"}`);
    }
  }
  for (const s of variant.sections) {
    if (!("entries" in s)) continue;
    for (const ref of s.entries) if (ref.job && !facts.jobs?.[ref.job]?.dates) out.push(`job "${clip(facts.jobs?.[ref.job]?.title ?? ref.job)}" has no dates`);
  }
  const bullets = content.sections.flatMap((s) => [...(s.bullets ?? []), ...(s.entries ?? []).flatMap((e) => e.bullets ?? [])]);
  if (bullets.length < floor.bullets_total) out.push(`${bullets.length} bullets in all, fewer than ${floor.bullets_total}`);
  const seen = new Set<string>();
  for (const b of bullets) {
    const n = words(b);
    if (n < floor.bullet_words_min) out.push(`a ${n}-word bullet: "${clip(b)}"`);
    if (n > floor.bullet_words_max) out.push(`a ${n}-word bullet: "${clip(b)}"`);
    const key = b.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(key)) out.push(`a bullet appears twice: "${clip(b)}"`);
    seen.add(key);
  }
  const placeholder = contentText(content).match(PLACEHOLDER);
  if (placeholder) out.push(`placeholder text: "${placeholder[0]}"`);
  return out;
}

/**
 * What a parser would miss: the name, the email, and every bullet must come back out of the built file's text (the
 * PDF when this machine can read one, else the Word file), each entry's bullets in their order. Lost digits, broken
 * ligatures, and columns read in the wrong order show up here, where no reading of the facts would find them.
 */
export async function extractionGaps(content: ResumeContent, files: string[]): Promise<string[]> {
  let text: string | null = null, which = "";
  for (const [ext, name] of [[".pdf", "PDF"], [".docx", "Word file"]] as const) {
    const file = files.find((f) => f.toLowerCase().endsWith(ext));
    if (text === null && file) { text = await extractDocumentText(file); which = name; }
  }
  if (text === null) return [];
  const norm = (s: string) => s.replace(/\*\*/g, "").replace(/\u00ad/g, "").replace(/\ufb01/g, "fi").replace(/\ufb02/g, "fl").replace(/\s+/g, " ").trim().toLowerCase();
  const hay = norm(text);
  const out: string[] = [];
  const email = content.contact.map((c) => c.text).find((x) => x.includes("@"));
  for (const want of [content.name, email]) if (want && !hay.includes(norm(want))) out.push(`the ${which}'s text lacks "${clip(want)}"`);
  for (const s of content.sections) {
    for (const e of s.entries ?? []) {
      let from = 0;
      for (const b of e.bullets ?? []) {
        const at = hay.indexOf(norm(b), from);
        if (at >= 0) { from = at; continue; }
        out.push(hay.includes(norm(b)) ? `the ${which}'s text has "${clip(e.title)}" bullets out of order` : `the ${which}'s text lacks or garbles: "${clip(b)}"`);
      }
    }
  }
  return out;
}

/** Prints what a build left below the floor, so the agent sees it with every build. */
export function printFloor(name: string, floor: string[]): void {
  if (!floor.length) return;
  console.log(`${name}: below the resume floor (resume_floor in pipeline.yaml):`);
  for (const line of floor) console.log(`  - ${line}`);
}
