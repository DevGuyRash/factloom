// Builds a truth-locked, posting-tailored resume into an application directory: starts from an
// existing variant and reorders its entries, bullets, and labeled skill groups by overlap with
// the posting's keywords (via the shared lexicon). Writes the derived spec (resume-tailored.yaml)
// plus the rendered docx/pdf. The agent may then edit that spec, choosing any of the person's facts,
// and `--spec` renders it again; either way, no text reaches the resume that the person has not
// reviewed in facts.yaml or one of their variants.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { writeFileSync } from "node:fs";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { readDoc, writeDoc } from "../lib/frontmatter.ts";
import { slugify } from "../lib/text.ts";
import { personOf, repoRoot } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";
import { loadLexicon, termsIn, type Lexicon } from "../render/lexicon.ts";
import {
  confirmsUsed, entryFactOf, findDocInDir, listVariants, loadFacts, loadVariant, resolveContent,
  type Facts, type Variant, type VariantEntryRef, type VariantSection,
} from "../render/spec.ts";
import { writeFitted } from "../render/fit.ts";
import { belowFloor, extractionGaps, printFloor } from "../render/floor.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { loadTheme } from "../render/theme.ts";
import { artifactIdentitySuffix, captureBuildSource, effectiveArtifactIdentity, lockArtifact, safeArtifactPath, tailoredDestination, validateApplication, validateOutput, writeBuildManifest } from "../lib/tailored-artifact.ts";
import { factsPath, variantPath } from "../render/spec.ts";
import { keywordReport } from "./keywords.ts";

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

type Tailored = { specPath: string; files: string[]; pages?: number; limit?: number; fits?: boolean; floor: string[]; reportPath: string };

export async function tailorApplication(dir: string, opts: { variant?: string; allowUnconfirmed?: boolean; theme?: string; neutral?: boolean; revision?: string } = {}, root = repoRoot()): Promise<Tailored> {
  const { person } = personOf(dir);
  validateApplication(dir, person, root);
  const release = lockArtifact(dir);
  try {
    const posting = findDocInDir(dir, "posting");
    if (!posting) throw new Error(`${dir}: no posting snapshot (type: posting)`);
    const record = findDocInDir(dir, "application");
    if (!record || record.data.person !== person || resolve(record.path, "..") !== resolve(dir)) throw new Error("application owner does not match this person");
    const out = tailoredDestination(dir, record.data, opts.revision);
    const variantName = opts.variant ?? (record && typeof record.data.resume === "string" ? record.data.resume : undefined);
    if (!variantName) throw new Error(`${dir}: no --variant given and the application record has no resume: <variant>`);

    validateOutput(variantName);
    const facts = loadFacts(person, root);
    if (facts.person !== person) throw new Error("facts owner does not match the application person");
    const variant = loadVariant(person, variantName, root);
    const identity = effectiveArtifactIdentity(person, root, facts, variant);
    validateOutput(variant.output);
    const confirms = confirmsUsed(facts, variant);
    if (confirms.length && !opts.allowUnconfirmed) {
      throw new Error(
        `${variantName} uses claims still awaiting the person's confirmation (${confirms.join("; ")}). Choose a variant whose claims are confirmed, ` +
          "or hold the application and put these phrases on the waiting list. --allow-unconfirmed builds a preview for the person to review, never a file to send.",
      );
    }

    const lexicon = loadLexicon(root);
    const postingText = [posting.data.company, posting.data.role, readDoc(posting.path).body].filter(Boolean).join("\n");
    const postingTerms = termsIn(lexicon, String(postingText));

    const sections = variant.sections.map((vs) => tailorSection(facts, lexicon, postingTerms, vs));
    // The employer's name in the file name tells uploads apart on boards that list them by name. A file that will
    // stay saved in a site's profile, and go out to later employers too, is built --neutral, without it. A build with
    // unconfirmed claims is a preview, and its name says so, so it is never uploaded by mistake.
    const company = opts.neutral ? "" : slugify(String(posting.data.company ?? record?.data.company ?? "")).split("-").slice(0, 3).join("-");
    const output = `${variant.output}${company ? `_${company}` : ""}${artifactIdentitySuffix(identity)}${confirms.length ? "_PREVIEW_unconfirmed" : ""}`;
    const tailored: Variant = { ...identity, variant: variant.variant, theme: opts.theme ?? variant.theme, headline: variant.headline, output, sections, ...(variant.style ? { style: variant.style } : {}), ...(variant.pages ? { pages: variant.pages } : {}) };

    const specPath = safeArtifactPath(dir, join(out, FILE_NAMES.tailoredResume));
    for (const name of ["tailored-artifact.json", `${output}.docx`, `${output}.pdf`]) safeArtifactPath(dir, join(out, name));
    const theme = loadTheme(tailored.theme, root, { person, overrides: tailored.style });
    const content = resolveContent(facts, tailored);
    const source = captureBuildSource(root, person, readFileSync(factsPath(person, root), "utf8"), readFileSync(variantPath(person, variantName, root), "utf8"));
    mkdirSync(out, { recursive: true });
    writeFileSync(specPath, YAML.stringify({ type: "tailored-resume", person, ...tailored }, { lineWidth: 0 }));

    const { files, pages, fits } = await writeFitted(theme, content, out, tailored.output, tailored.pages);
    // The variant used is the record's resume, so the record says what went out.
    writeBuildManifest(dir, out, person, identity, source, files, confirms.length === 0);
    if (!opts.revision && record && opts.variant && record.data.resume !== opts.variant) {
      const doc = readDoc(record.path);
      writeDoc(record.path, { ...doc.data, resume: opts.variant }, doc.body);
    }
    const report = await keywordReport(dir, root, variantName, { artifact: files.find((f) => f.endsWith(".docx")), spec: specPath, reportDir: out });
    return { specPath, files, pages, reportPath: report.path, limit: tailored.pages, fits, floor: [...belowFloor(content, facts, tailored, loadPipelineConfig(root).resume_floor), ...(await extractionGaps(content, files))] };
  } finally { release(); }
}

/**
 * Text in a spec that is not a reference to a fact (the headline, paragraphs, and entry titles shown in place of a
 * fact's own) must already appear in one of the person's variants, which they have reviewed. Returns what does not.
 */
function unreviewedText(facts: Facts, spec: Variant, person: string, root: string): string[] {
  const known = new Set<string>();
  for (const name of listVariants(person, root)) {
    const v = loadVariant(person, name, root);
    known.add(v.headline);
    for (const s of v.sections) {
      if ("paragraph" in s) known.add(s.paragraph);
      if ("entries" in s) for (const ref of s.entries) if (ref.title) known.add(ref.title);
    }
  }
  const out: string[] = [];
  if (spec.headline && !known.has(spec.headline)) out.push(spec.headline);
  for (const s of spec.sections) {
    if ("paragraph" in s && !known.has(s.paragraph)) out.push(s.paragraph);
    if ("entries" in s) {
      for (const ref of s.entries) {
        if (ref.title && !known.has(ref.title) && ref.title !== entryFactOf(facts, ref).fact.title) out.push(ref.title);
      }
    }
  }
  return out;
}

/**
 * Renders the application's resume-tailored.yaml again after the agent edited it: any entries, bullets, skills, and
 * lines from facts.yaml, in any order, under the headline and paragraphs of one of the person's variants.
 */
export async function rebuildTailored(dir: string, opts: { allowUnconfirmed?: boolean; revision?: string } = {}, root = repoRoot()): Promise<Tailored> {
  const { person } = personOf(dir);
  validateApplication(dir, person, root);
  const release = lockArtifact(dir);
  try {
    const record = findDocInDir(dir, "application");
    if (!record || record.data.person !== person || resolve(record.path, "..") !== resolve(dir)) throw new Error("application owner does not match this person");
    const out = tailoredDestination(dir, record.data, opts.revision, { reuseDraft: true });
    const inputDir = opts.revision && existsSync(join(out, FILE_NAMES.tailoredResume)) ? out : dir;
    const specPath = safeArtifactPath(dir, join(inputDir, FILE_NAMES.tailoredResume));
    if (!existsSync(specPath)) throw new Error(`${dir}: no ${FILE_NAMES.tailoredResume} yet; run tailor without --spec first, then edit it`);
    const { type, person: _owner, ...rest } = (YAML.parse(readFileSync(specPath, "utf8")) ?? {}) as Record<string, unknown>;
    if (_owner !== person) throw new Error("tailored spec owner does not match the application person");
    if (type !== "tailored-resume") throw new Error(`${specPath}: not a tailored-resume spec`);
    const spec = rest as unknown as Variant;
    if (typeof spec.variant !== "string" || typeof spec.theme !== "string" || !spec.output || !Array.isArray(spec.sections)) throw new Error(`${specPath}: needs theme, output, and sections`);
    validateOutput(spec.output);
    const facts = loadFacts(person, root);
    if (facts.person !== person) throw new Error("facts owner does not match the application person");
    const identity = effectiveArtifactIdentity(person, root, facts, spec);
    const content = resolveContent(facts, spec);
    const unreviewed = unreviewedText(facts, spec, person, root);
    if (unreviewed.length) {
      throw new Error(
        `text the person has not reviewed: ${unreviewed.map((u) => JSON.stringify(u.length > 70 ? `${u.slice(0, 70)}…` : u)).join("; ")}. ` +
          "Take the headline, paragraphs, and entry titles from one of the person's variants; new wording goes into a variant or facts.yaml for them to review first.",
      );
    }
    const confirms = confirmsUsed(facts, spec);
    if (confirms.length && !opts.allowUnconfirmed) {
      throw new Error(`the spec uses claims still awaiting the person's confirmation (${confirms.join("; ")}). Leave them out, or hold the application and put these phrases on the waiting list.`);
    }
    const output = `${spec.output.replace(/_PREVIEW_unconfirmed$/, "")}${artifactIdentitySuffix(identity) && !spec.output.replace(/_PREVIEW_unconfirmed$/, "").endsWith(artifactIdentitySuffix(identity)) ? artifactIdentitySuffix(identity) : ""}${confirms.length ? "_PREVIEW_unconfirmed" : ""}`;
    const theme = loadTheme(spec.theme, root, { person, overrides: spec.style });
    const targetSpec = safeArtifactPath(dir, join(out, FILE_NAMES.tailoredResume));
    for (const name of ["tailored-artifact.json", `${output}.docx`, `${output}.pdf`]) safeArtifactPath(dir, join(out, name));
    const source = captureBuildSource(root, person, readFileSync(factsPath(person, root), "utf8"), readFileSync(specPath, "utf8"));
    mkdirSync(out, { recursive: true });
    writeFileSync(targetSpec, YAML.stringify({ type: "tailored-resume", person, ...spec, ...identity, output }, { lineWidth: 0 }));
    const { files, pages, fits } = await writeFitted(theme, content, out, output, spec.pages);
    writeBuildManifest(dir, out, person, identity, source, files, confirms.length === 0);
    const report = await keywordReport(dir, root, spec.variant, { artifact: files.find((f) => f.endsWith(".docx")), spec: targetSpec, reportDir: out });
    return { specPath: targetSpec, files, pages, reportPath: report.path, limit: spec.pages, fits, floor: [...belowFloor(content, facts, spec, loadPipelineConfig(root).resume_floor), ...(await extractionGaps(content, files))] };
  } finally { release(); }
}

const command: Command = {
  name: "tailor",
  summary: "Build a posting-tailored resume from the person's own facts into an application directory",
  usage: [
    "resumes tailor <application-dir> [--variant <name>] [--theme <name>] [--neutral] [--allow-unconfirmed] [--revision <new-name>]",
    "resumes tailor <application-dir> --spec [--allow-unconfirmed] [--revision <name>]   (render resume-tailored.yaml again after editing it)",
  ].join("\n       "),
  async run(argv) {
    const a = parseArgs(argv, ["allow-unconfirmed", "neutral", "spec"]);
    const dirArg = a._[0];
    if (!dirArg) { console.error("usage: resumes tailor <application-dir> [--variant <name>] [--theme <name>] [--allow-unconfirmed] | --spec"); return 2; }
    const dir = resolve(dirArg);
    if (!existsSync(dir)) { console.error(`${dir}: not found`); return 1; }
    try {
      const { specPath, files, pages, limit, fits, floor, reportPath } = has(a, "spec")
        ? await rebuildTailored(dir, { allowUnconfirmed: has(a, "allow-unconfirmed"), revision: flag(a, "revision") })
        : await tailorApplication(dir, { variant: flag(a, "variant"), theme: flag(a, "theme"), allowUnconfirmed: has(a, "allow-unconfirmed"), neutral: has(a, "neutral"), revision: flag(a, "revision") });
      console.log(`wrote ${specPath}`);
      console.log(`evidence report ${reportPath}`);
      for (const f of files) console.log(`wrote ${f}`);
      if (pages !== undefined) {
        const over = limit ? fits === false : pages > 2;
        console.log(`pages: ${pages}${limit ? ` (the variant allows ${limit})` : ""}${over ? ": longer than intended; check the guide and the portal's limits before uploading" : ""}`);
      }
      printFloor("tailored resume", floor);
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  },
};
export default command;
