// Renders resume variants from the content/structure/style SSOT: facts.yaml (content),
// resumes/source/variants/<name>.yaml (structure), and a theme file (style). Also derives each
// built variant's guide.md `review`/`status` fields from the `confirm` phrases its bullets use.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { readDoc, writeDoc } from "../lib/frontmatter.ts";
import { listGenerated, staleGenerated } from "../lib/generated.ts";
import { personDir, repoRoot, resolvePerson } from "../lib/repo.ts";
import { type FitResult, writeFitted } from "../render/fit.ts";
import { confirmsUsed, listVariants, loadFacts, loadVariant, resolveContent } from "../render/spec.ts";
import { loadTheme } from "../render/theme.ts";

const guidePathFor = (person: string, variant: string, root: string) => join(personDir(person, root), "resumes", "active", variant, "guide.md");

/** Review items derived from facts.yaml carry this prefix; every other item is the person's own and is kept. */
export const DERIVED_REVIEW_PREFIX = "Confirm: ";

/**
 * Updates only `review`, `status`, and `generated` in an existing guide: derived items are replaced by
 * the current `confirm` phrases, hand-written items stay, and the guide is ready only when no item
 * remains. `generated: true` records that the active files are built from resumes/source, so they are
 * rebuilt rather than edited (and the reproduction test checks them). `fitted` records the page-fitting
 * step the build used for a variant with `pages`, so a check reproduces the file without LibreOffice.
 */
function updateGuide(person: string, variant: string, confirms: string[], root: string, fitted?: string): void {
  const path = guidePathFor(person, variant, root);
  if (!existsSync(path)) return;
  const { data, body } = readDoc(path);
  const manual = (Array.isArray(data.review) ? data.review : []).filter((x) => typeof x === "string" && !x.startsWith(DERIVED_REVIEW_PREFIX));
  data.review = [...manual, ...confirms.map((c) => DERIVED_REVIEW_PREFIX + c)];
  data.status = (data.review as string[]).length ? "needs-review" : "ready";
  data.generated = true;
  if (fitted) data.fitted = fitted;
  else delete data.fitted;
  writeDoc(path, data, body);
}

export async function buildVariant(person: string, variantName: string, dir: string, root = repoRoot(), opts: { theme?: string } = {}): Promise<string[]> {
  return (await buildVariantFitted(person, variantName, dir, root, opts)).files;
}

/** Builds a variant and reports how it fit its `pages` target, when it has one. */
export async function buildVariantFitted(person: string, variantName: string, dir: string, root = repoRoot(), opts: { theme?: string } = {}): Promise<FitResult> {
  const facts = loadFacts(person, root);
  const variant = loadVariant(person, variantName, root);
  const theme = loadTheme(opts.theme ?? variant.theme, root, { person, overrides: variant.style });
  const content = resolveContent(facts, variant);
  const fit = await writeFitted(theme, content, dir, variant.output, variant.pages);
  // Only a build into the active variant directory speaks for the guide; review copies (--out, --theme) leave it alone.
  const active = join(personDir(person, root), "resumes", "active", variantName);
  if (resolve(dir) === resolve(active) && !opts.theme) updateGuide(person, variantName, confirmsUsed(facts, variant), root, variant.pages ? fit.step : undefined);
  return fit;
}

/** A one-line note on page fitting, or "" when the variant sets no page target. */
export function fitNote(variant: string, target: number | undefined, fit: FitResult): string {
  if (!target || fit.pages === undefined) return "";
  return fit.fits
    ? `${variant}: ${fit.pages} page(s), within pages: ${target}${fit.step !== "as designed" ? ` (${fit.step})` : ""}`
    : `${variant}: still ${fit.pages} pages after the tightest setting (${fit.step}); shorten the variant or raise pages: ${target}`;
}

/** `--check`: the generated resumes this engine would render differently from their files, writing nothing. */
async function checkGenerated(root: string): Promise<number> {
  const all = listGenerated(root);
  if (!all.length) { console.log("no generated resumes to check (guides with generated: true)"); return 0; }
  const stale = await staleGenerated(root);
  if (!stale.length) { console.log(`all ${all.length} generated resume(s) render exactly as their files`); return 0; }
  console.log(`${stale.length} of ${all.length} generated resume(s) would render differently; look with --person <p> --variant <v> --out <dir>, then rebuild, review, and commit:`);
  for (const g of stale) console.log(`  ${g.person}/${g.variant}`);
  return 1;
}

const command: Command = {
  name: "build-resumes",
  summary: "Render resume variants from facts.yaml + variants/*.yaml (content/structure/style SSOT)",
  usage: "resumes build-resumes [--person <slug>] [--variant <name>] [--theme <name>] [--out <dir>] | build-resumes --check",
  async run(argv) {
    const a = parseArgs(argv, ["check"]);
    const root = repoRoot();
    if (has(a, "check")) return checkGenerated(root);
    const person = resolvePerson(flag(a, "person"), root);
    const out = flag(a, "out");
    const themeArg = flag(a, "theme");
    if (themeArg && !out) { console.error("--theme renders a review copy: pass --out <dir> too, so the active resume stays as its variant defines it"); return 2; }
    const variantArg = flag(a, "variant");
    const names = variantArg ? [variantArg] : listVariants(person, root);
    if (!names.length) { console.error(`no variants found for ${person}`); return 1; }
    for (const name of names) {
      const dir = out ? (names.length > 1 ? join(out, name) : out) : join(personDir(person, root), "resumes", "active", name);
      const fit = await buildVariantFitted(person, name, dir, root, { theme: themeArg });
      for (const f of fit.files) console.log(`wrote ${f}`);
      const note = fitNote(name, loadVariant(person, name, root).pages, fit);
      if (note) console.log(note);
    }
    return 0;
  },
};
export default command;
