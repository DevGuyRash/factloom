import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "./frontmatter.ts";
import { dataLayers } from "./layers.ts";
import { findOne, personDir, repoRoot, today } from "./repo.ts";
import { FILE_NAMES, POLICIES } from "./schema.ts";

export type Policy = (typeof POLICIES)[number];
/** `essential` entries are core entries asked before the first application; `core` covers both. */
export type CatalogEntry = { id: string; core: boolean; essential: boolean; section: string; ask: string; seenAs?: string; shape?: string; policy: Policy };
export type Answer = { id: string; answer: string; policy: Policy; confirmed?: string; notes?: string; source?: string };

const field = (block: string, name: string) => block.match(new RegExp(`^- ${name}:[ \\t]*(.*)$`, "m"))?.[1].trim();

/**
 * Entries of the onboarding catalog: shared/onboarding.md, then custom/onboarding.md (an entry there
 * with the same id replaces the shared one; new ids are added).
 */
export function loadCatalog(root = repoRoot()): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const path of dataLayers("onboarding.md", root)) for (const e of catalogEntries(path)) byId.set(e.id, e);
  return [...byId.values()];
}

function catalogEntries(path: string): CatalogEntry[] {
  if (!existsSync(path)) return [];
  const { body } = parse(readFileSync(path, "utf8"));
  const out: CatalogEntry[] = [];
  let section = "";
  for (const chunk of body.split(/^(?=##+ )/m)) {
    const h2 = chunk.match(/^## (.+)$/m);
    if (h2 && !chunk.startsWith("###")) section = h2[1].trim();
    const h3 = chunk.match(/^### (\S+)(.*)$/m);
    if (!h3) continue;
    out.push({
      id: h3[1], core: /\((?:core|essential)\)/.test(h3[2]), essential: /\(essential\)/.test(h3[2]), section, ask: field(chunk, "Ask") ?? "",
      seenAs: field(chunk, "Seen as"), shape: field(chunk, "Shape"), policy: (field(chunk, "Policy") as Policy) ?? "ask",
    });
  }
  return out;
}

const ANSWER_FIELDS = ["Answer", "Policy", "Confirmed", "Notes", "Source"];

/**
 * An answer block's fields. A field runs on over the lines after it (a note with several conditions, wording
 * for a free-text field) until a blank line, a heading, or the next field.
 */
function answerFields(block: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  for (const line of block.split("\n").slice(1)) {
    const m = line.match(/^- ([A-Z][a-z]+):[ \t]?(.*)$/);
    if (m && ANSWER_FIELDS.includes(m[1])) {
      current = m[1];
      out.set(current, m[2].trim());
    } else if (current && line.trim() && !line.startsWith("#")) out.set(current, `${out.get(current)}\n${line.trimEnd()}`);
    else current = null;
  }
  return out;
}

export function parseAnswers(text: string): Map<string, Answer> {
  const out = new Map<string, Answer>();
  for (const block of text.split(/^### /m).slice(1)) {
    const id = block.split("\n")[0].trim();
    const f = answerFields(block);
    out.set(id, {
      id, answer: f.get("Answer") ?? "", policy: (f.get("Policy") as Policy) ?? "confirm",
      confirmed: f.get("Confirmed") || undefined, notes: f.get("Notes") || undefined, source: f.get("Source") || undefined,
    });
  }
  return out;
}

export const formatAnswer = (a: Answer) =>
  [`### ${a.id}`, `- Answer: ${a.answer}`, `- Policy: ${a.policy}`, ...(a.confirmed !== undefined ? [`- Confirmed: ${a.confirmed}`] : []),
   ...(a.notes ? [`- Notes: ${a.notes}`] : []), ...(a.source ? [`- Source: ${a.source}`] : [])].join("\n");

export function savedAnswersPath(person: string, root = repoRoot()) {
  return findOne(person, "answers", root) ?? join(personDir(person, root), "answers.md");
}
export const sessionAnswersPath = (person: string, root = repoRoot()) => join(personDir(person, root), FILE_NAMES.sessionAnswers);

export function loadAnswers(path: string): Map<string, Answer> {
  return existsSync(path) ? parseAnswers(parse(readFileSync(path, "utf8")).body) : new Map();
}

/** Core catalog questions (essential ones included) that neither the saved answers nor this session's answers settle. */
export function openCoreQuestions(person: string, root = repoRoot()): CatalogEntry[] {
  const saved = loadAnswers(savedAnswersPath(person, root));
  const session = loadAnswers(sessionAnswersPath(person, root));
  return loadCatalog(root).filter((e) => e.core && !(session.get(e.id)?.answer) && !(saved.get(e.id)?.answer && saved.get(e.id)?.confirmed));
}

export const sessionHeader = (person: string) => `---\ntype: session-answers\nperson: ${person}\nsession: ${today()}\n---\n`;
