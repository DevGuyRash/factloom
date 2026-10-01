// Keyword lexicon: canonical skill/keyword terms with aliases (shared/lexicon.yaml, plus any terms
// in custom/lexicon.yaml, which add to or replace shared ones by id), used by both the keywords and
// tailor commands so matching logic and the term list each live in one place.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { dataLayers } from "../lib/layers.ts";
import { repoRoot } from "../lib/repo.ts";

export type LexiconEntry = { label: string; aliases: string[] };
export type Lexicon = Record<string, LexiconEntry>;

export function loadLexicon(root = repoRoot()): Lexicon {
  const out: Lexicon = {};
  for (const path of dataLayers("lexicon.yaml", root)) Object.assign(out, (YAML.parse(readFileSync(path, "utf8")) ?? {}) as Lexicon);
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive, word-boundary regex matching a term's canonical label or any alias. */
function termPattern(id: string, entry: LexiconEntry): RegExp {
  const phrases = [entry.label, id, ...entry.aliases].map(escapeRe);
  return new RegExp(`\\b(${phrases.join("|")})\\b`, "i");
}

/** The lexicon ids whose label or an alias appears in `text`. */
export function termsIn(lexicon: Lexicon, text: string): Set<string> {
  const found = new Set<string>();
  for (const [id, entry] of Object.entries(lexicon)) if (termPattern(id, entry).test(text)) found.add(id);
  return found;
}

export const labelOf = (lexicon: Lexicon, id: string): string => lexicon[id]?.label ?? id;
