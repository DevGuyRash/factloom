// Builds a truth-locked, posting-tailored resume into an application directory: starts from an
// existing variant and reorders its entries, bullets, and labeled skill groups by overlap with
// the posting's keywords (via the shared lexicon). Never adds text absent from facts.yaml — only
// reordering is allowed. Writes the derived spec (resume-tailored.yaml) plus the rendered docx/pdf.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { writeFileSync } from "node:fs";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { readDoc } from "../lib/frontmatter.ts";
import { personOf, repoRoot } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";
import { loadLexicon, termsIn, type Lexicon } from "../render/lexicon.ts";
import {
  confirmsUsed, entryFactOf, findDocInDir, loadFacts, loadVariant, pickBullets, resolveContent,
  type Facts, type Variant, type VariantEntryRef, type VariantSection,
} from "../render/spec.ts";
import { writeFitted } from "../render/fit.ts";
import { loadTheme } from "../render/theme.ts";

function scoreText(lexicon: Lexicon, postingTerms: Set<string>, text: string): number {
  let n = 0;
  for (const t of termsIn(lexicon, text)) if (postingTerms.has(t)) n++;
  return n;
}

/** Stable descending sort: ties keep their original relative order. */
function byScoreDesc<T>(items: T[], score: (item: T) => number): T[] {
  return items.map((item, i) => ({ item, i, s: score(item) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.item);
}

function tailorSection(facts: Facts, lexicon: Lexicon, postingTerms: Set<string>, vs: VariantSection): VariantSection {
  if ("labeled" in vs) {
    return { ...vs, labeled: byScoreDesc(vs.labeled, (id) => scoreText(lexicon, postingTerms, facts.skills[id]?.items ?? "")) };
  }
  if ("entries" in vs) {
    const ranked = vs.entries.map((ref) => {
      const { fact } = entryFactOf(facts, ref);
      const indices = ref.bullets ?? fact.bullets.map((_, i) => i);
      const orderedIndices = byScoreDesc(indices, (i) => scoreText(lexicon, postingTerms, fact.bullets[i]?.text ?? ""));
      const entryScore = orderedIndices.reduce((sum, i) => sum + scoreText(lexicon, postingTerms, fact.bullets[i]?.text ?? ""), 0);
      const newRef: VariantEntryRef = { ...ref, bullets: orderedIndices };
      return { ref: newRef, score: entryScore };
    });
    return { ...vs, entries: byScoreDesc(ranked, (r) => r.score).map((r) => r.ref) };
  }
  return vs;
}

export async function tailorApplication(dir: string, opts: { variant?: string; allowUnconfirmed?: boolean; theme?: string } = {}, root = repoRoot()): Promise<{ specPath: string; files: string[] }> {
  const { person } = personOf(dir);
  const posting = findDocInDir(dir, "posting");
  if (!posting) throw new Error(`${dir}: no posting snapshot (type: posting)`);
  const record = findDocInDir(dir, "application");
  const variantName = opts.variant ?? (record && typeof record.data.resume === "string" ? record.data.resume : undefined);
  if (!variantName) throw new Error(`${dir}: no --variant given and the application record has no resume: <variant>`);

  const facts = loadFacts(person, root);
  const variant = loadVariant(person, variantName, root);
  const confirms = confirmsUsed(facts, variant);
  if (confirms.length && !opts.allowUnconfirmed) {
    throw new Error(`${variantName}: still has unconfirmed claims (${confirms.join("; ")}); pass --allow-unconfirmed to tailor anyway`);
  }

  const lexicon = loadLexicon(root);
  const postingText = [posting.data.company, posting.data.role, readDoc(posting.path).body].filter(Boolean).join("\n");
  const postingTerms = termsIn(lexicon, String(postingText));

  const sections = variant.sections.map((vs) => tailorSection(facts, lexicon, postingTerms, vs));
  const tailored: Variant = { variant: variant.variant, theme: opts.theme ?? variant.theme, headline: variant.headline, output: variant.output, sections, ...(variant.style ? { style: variant.style } : {}), ...(variant.pages ? { pages: variant.pages } : {}) };

  const specPath = join(dir, FILE_NAMES.tailoredResume);
  writeFileSync(specPath, YAML.stringify({ type: "tailored-resume", person, ...tailored }, { lineWidth: 0 }));

  const theme = loadTheme(tailored.theme, root, { person, overrides: tailored.style });
  const content = resolveContent(facts, tailored);
  const { files } = await writeFitted(theme, content, dir, tailored.output, tailored.pages);
  return { specPath, files };
}

const command: Command = {
  name: "tailor",
  summary: "Build a posting-tailored resume (reordered, never invented) into an application directory",
  usage: "resumes tailor <application-dir> [--variant <name>] [--theme <name>] [--allow-unconfirmed]",
  async run(argv) {
    const a = parseArgs(argv, ["allow-unconfirmed"]);
    const dirArg = a._[0];
    if (!dirArg) { console.error("usage: resumes tailor <application-dir> [--variant <name>] [--theme <name>] [--allow-unconfirmed]"); return 2; }
    const dir = resolve(dirArg);
    if (!existsSync(dir)) { console.error(`${dir}: not found`); return 1; }
    try {
      const { specPath, files } = await tailorApplication(dir, { variant: flag(a, "variant"), theme: flag(a, "theme"), allowUnconfirmed: has(a, "allow-unconfirmed") });
      console.log(`wrote ${specPath}`);
      for (const f of files) console.log(`wrote ${f}`);
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  },
};
export default command;
