// Compares an application's posting snapshot with a resume variant and the person's full facts, via
// the shared lexicon (shared/lexicon.yaml). Writes an honest keyword report: what matched, what's
// true of the person but missing from that resume, and what the posting wants with no evidence
// anywhere in their facts. The variant is --variant, else the record's `resume`, else the variant
// that matches the posting best (the report then ranks them all, to help choose).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { readDoc, writeDoc } from "../lib/frontmatter.ts";
import { personOf, repoRoot } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";
import { labelOf, loadLexicon, termsIn } from "../render/lexicon.ts";
import { contentText, factsText, findDocInDir, listVariants, loadFacts, loadVariant, resolveContent } from "../render/spec.ts";

export type Ranked = { variant: string; matched: number };

export function keywordReport(dir: string, root = repoRoot(), chosen?: string): { path: string; body: string; ranking?: Ranked[] } {
  const { person } = personOf(dir);
  const posting = findDocInDir(dir, "posting");
  if (!posting) throw new Error(`${dir}: no posting snapshot (type: posting)`);
  const record = findDocInDir(dir, "application");
  const recorded = record && typeof record.data.resume === "string" && record.data.resume ? record.data.resume : undefined;

  const facts = loadFacts(person, root);
  const lexicon = loadLexicon(root);
  const postingBody = readDoc(posting.path).body;
  const postingText = [posting.data.company, posting.data.role, postingBody].filter(Boolean).join("\n");
  const postingTerms = termsIn(lexicon, postingText);
  const factsTerms = termsIn(lexicon, factsText(facts));
  const resumeTermsOf = (name: string) => termsIn(lexicon, contentText(resolveContent(facts, loadVariant(person, name, root))));

  let variantName = chosen ?? recorded;
  let ranking: Ranked[] | undefined;
  if (!variantName) {
    ranking = listVariants(person, root)
      .map((variant) => { const terms = resumeTermsOf(variant); return { variant, matched: [...postingTerms].filter((t) => terms.has(t)).length }; })
      .sort((a, b) => b.matched - a.matched || a.variant.localeCompare(b.variant));
    if (!ranking.length) throw new Error(`${dir}: ${person} has no resume variants to compare`);
    variantName = ranking[0].variant;
  }
  const resumeTerms = resumeTermsOf(variantName);

  const matched = [...postingTerms].filter((t) => resumeTerms.has(t)).sort();
  const missing = [...postingTerms].filter((t) => factsTerms.has(t) && !resumeTerms.has(t)).sort();
  const gaps = [...postingTerms].filter((t) => !factsTerms.has(t)).sort();

  const label = (id: string) => labelOf(lexicon, id);
  const list = (ids: string[]) => (ids.length ? ids.map((id) => `- ${label(id)}`).join("\n") : "- none");
  const title = [posting.data.company, posting.data.role].filter(Boolean).join(" — ");
  const body = `# Keyword report${title ? `: ${title}` : ""}

Resume used: \`${variantName}\`
${ranking ? `\n## Variant ranking (no resume chosen yet)\n\n${ranking.map((r) => `- \`${r.variant}\`: ${r.matched} matched`).join("\n")}\n` : ""}
## Matched terms (in both the posting and this resume)

${list(matched)}

## In your facts but missing from this resume

${list(missing)}

## Posting terms with no evidence in your facts (honest gaps)

${list(gaps)}
`;
  const data: Record<string, unknown> = { type: "keyword-report", person, resume: variantName, generated: new Date().toLocaleDateString("en-CA") };
  if (posting.data.company) data.company = posting.data.company;
  if (posting.data.role) data.role = posting.data.role;
  const out = join(dir, FILE_NAMES.keywordReport);
  writeDoc(out, data, body);
  return { path: out, body, ranking };
}

const command: Command = {
  name: "keywords",
  summary: "Compare a posting with a resume variant (or rank them all) and the person's facts; write a keyword report",
  usage: "resumes keywords <application-dir> [--variant <name>]",
  run(argv) {
    const a = parseArgs(argv);
    const dirArg = a._[0];
    if (!dirArg) { console.error("usage: resumes keywords <application-dir> [--variant <name>]"); return 2; }
    const dir = resolve(dirArg);
    if (!existsSync(dir)) { console.error(`${dir}: not found`); return 1; }
    try {
      const { path, ranking } = keywordReport(dir, repoRoot(), flag(a, "variant"));
      for (const r of ranking ?? []) console.log(`${r.variant}: ${r.matched} matched`);
      console.log(`wrote ${path}`);
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  },
};
export default command;
