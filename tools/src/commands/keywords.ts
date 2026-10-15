// Compares the posting, full source inventory and actual final artifact. Lexical presence is a
// review lead, never proof of qualification. Historical comparisons use frozen sent bytes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { readDoc, writeDoc } from "../lib/frontmatter.ts";
import { extractDocumentText } from "../lib/pii.ts";
import { personOf, personDir, repoRoot } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";
import { hasSubmissionHistory, readSubmissionArtifact } from "../lib/tailored-artifact.ts";
import { labelOf, loadLexicon, termsIn } from "../render/lexicon.ts";
import { contentText, factEvidence, factsPath, factsText, findDocInDir, listVariants, loadFacts, loadVariant, resolveContent, type FactEvidence, type Variant } from "../render/spec.ts";

export type Ranked = { variant: string; matched: number };
export type Coverage = FactEvidence & { present: boolean; relevant: boolean; omission?: string };
export type KeywordOptions = { artifact?: string; spec?: string; source?: string; baseline?: string; omissions?: Record<string, string>; reportDir?: string };
export type KeywordResult = { path: string; body: string; ranking?: Ranked[]; compared: string; matched: string[]; confirmedMissing: string[]; unconfirmed: string[]; coverage: Coverage[]; reviewDiff?: { added: string[]; removed: string[] } };
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
async function artifactText(file: string): Promise<string> {
  if (!/\.(docx|pdf)$/i.test(file)) throw new Error(`${file}: final artifacts must be DOCX or PDF`);
  const text = await extractDocumentText(file);
  if (text === null) throw new Error(`${file}: artifact text unavailable; comparison remains unverified`);
  return text;
}
function specAt(file: string, person: string): Variant {
  const value = YAML.parse(readFileSync(file, "utf8"));
  if (!value || value.type !== "tailored-resume" || value.person !== person || typeof value.output !== "string" || !Array.isArray(value.sections)) throw new Error(`${file}: expected this person's tailored-resume spec`);
  if (basename(value.output) !== value.output || !value.output.trim()) throw new Error(`${file}: output must be a plain filename`);
  return value as Variant;
}

export async function keywordReport(dir: string, root = repoRoot(), chosen?: string, opts: KeywordOptions = {}): Promise<KeywordResult> {
  const { person } = personOf(dir);
  const posting = findDocInDir(dir, "posting");
  if (!posting) throw new Error(`${dir}: no posting snapshot (type: posting)`);
  const record = findDocInDir(dir, "application");
  const recorded = typeof record?.data.resume === "string" ? record.data.resume : undefined;
  const facts = loadFacts(person, root);
  const lexicon = loadLexicon(root);
  const postingText = [posting.data.company, posting.data.role, readDoc(posting.path).body].filter(Boolean).join("\n");
  const postingTerms = termsIn(lexicon, postingText);
  const evidence = factEvidence(facts);
  const confirmedTerms = termsIn(lexicon, factsText(facts));
  const heldTerms = termsIn(lexicon, evidence.filter(f => f.state === "unconfirmed").map(f => f.text).join("\n"));
  const resumeTermsOf = (name: string) => termsIn(lexicon, contentText(resolveContent(facts, loadVariant(person, name, root))));
  let variantName = chosen ?? recorded;
  let ranking: Ranked[] | undefined;
  if (!variantName) {
    ranking = listVariants(person, root).map(variant => ({ variant, matched: [...postingTerms].filter(t => resumeTermsOf(variant).has(t)).length })).sort((a, b) => b.matched - a.matched || a.variant.localeCompare(b.variant));
    if (!ranking.length) throw new Error(`${dir}: ${person} has no resume variants to compare`);
    variantName = ranking[0].variant;
  }

  let artifact = opts.artifact ? resolve(opts.artifact) : undefined;
  let spec = opts.spec ? resolve(opts.spec) : undefined;
  let text: string;
  let compared: string;
  let sourceRevision: string | null = null;
  let artifactIdentity = "unknown (no artifact provenance supplied)";
  const historical = record && hasSubmissionHistory(record.data);
  if (!artifact && !spec && !chosen && historical) {
    const frozen = readSubmissionArtifact(dir, record.data);
    artifact = frozen.selected_file ?? undefined;
    artifactIdentity = `${frozen.identity.mode}${frozen.identity.batch_id ? `; batch ${frozen.identity.batch_id}` : ""} (captured at submit click)`;
    if (!artifact) throw new Error(`historical sent artifact unknown: ${frozen.reason ?? "the exact upload selection was not recorded"}; provide an exact known --artifact or explicitly choose --variant for a current-source projection`);
    sourceRevision = frozen.source_revision;
  }
  if (!artifact && !spec && !chosen && existsSync(join(dir, FILE_NAMES.tailoredResume))) spec = join(dir, FILE_NAMES.tailoredResume);
  if (spec) {
    const declared = specAt(spec, person);
    artifactIdentity = declared.mode ? `${declared.mode}${declared.batch_id ? `; batch ${declared.batch_id}` : ""} (declared in spec)` : "unknown (legacy spec)";
  }
  if (spec && !artifact) {
    const selected = specAt(spec, person);
    const base = dirname(spec);
    artifact = [join(base, `${selected.output}.docx`), join(base, `${selected.output}.pdf`)].find(existsSync);
    if (!artifact && historical) throw new Error("historical tailored spec has no exact retained artifact; current facts cannot reconstruct sent bytes");
    text = artifact ? await artifactText(artifact) : contentText(resolveContent(facts, selected));
    compared = artifact ? relative(root, artifact) : `${relative(root, spec)} (current-source projection; final file unverified)`;
  } else if (artifact) {
    text = await artifactText(artifact);
    compared = relative(root, artifact);
  } else {
    text = contentText(resolveContent(facts, loadVariant(person, variantName, root)));
    compared = `variant ${variantName} (current-source projection; final file unverified)`;
  }
  const resumeTerms = termsIn(lexicon, text);
  const matched = [...postingTerms].filter(t => resumeTerms.has(t) && confirmedTerms.has(t)).sort();
  const missing = [...postingTerms].filter(t => confirmedTerms.has(t) && !resumeTerms.has(t)).sort();
  const unconfirmed = [...postingTerms].filter(t => heldTerms.has(t) && !confirmedTerms.has(t)).sort();
  const gaps = [...postingTerms].filter(t => !confirmedTerms.has(t) && !heldTerms.has(t)).sort();
  const coverage: Coverage[] = evidence.map(f => ({ ...f, present: normalize(text).includes(normalize(f.text)), relevant: [...termsIn(lexicon, f.text)].some(t => postingTerms.has(t)), ...(opts.omissions?.[f.id] ? { omission: opts.omissions[f.id] } : {}) }));
  for (const [id, reason] of Object.entries(opts.omissions ?? {})) if (!evidence.some(f => f.id === id) || !reason.trim()) throw new Error(`${id}: an omission needs an existing fact ID and a nonempty reason`);
  const leads = coverage.filter(f => f.relevant && !f.present);
  const source = opts.source ? resolve(opts.source) : join(personDir(person, root), "evidence.md");
  let sourceLeads: string[] = [];
  if (existsSync(source)) {
    const original = /\.(docx|pdf)$/i.test(source) ? await artifactText(source) : readFileSync(source, "utf8");
    sourceLeads = original.split(/\r?\n/).flatMap((line, i) => [...termsIn(lexicon, line)].some(t => postingTerms.has(t)) ? [`- ${relative(root, source)}:${i + 1}: ${line.trim()}`] : []);
  } else if (opts.source) throw new Error(`${source}: original source not found`);
  let reviewDiff: KeywordResult["reviewDiff"];
  if (opts.baseline) {
    const before = await artifactText(resolve(opts.baseline));
    const lines = (value: string) => value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const oldLines = lines(before), newLines = lines(text);
    // A literal changed block preserves ordering and duplicate lines without quadratic storage.
    let start = 0, oldEnd = oldLines.length, newEnd = newLines.length;
    while (start < oldEnd && start < newEnd && oldLines[start] === newLines[start]) start++;
    while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) { oldEnd--; newEnd--; }
    reviewDiff = { added: newLines.slice(start, newEnd), removed: oldLines.slice(start, oldEnd) };
  }
  const list = (ids: string[]) => ids.length ? ids.map(id => `- ${labelOf(lexicon, id)}`).join("\n") : "- none";
  const reference = (f: FactEvidence) => [`facts.yaml#${f.id}`, ...f.sources, ...f.confirmedBy.map(s => `later confirmation reference: ${s}`)].join("; ");
  const title = [posting.data.company, posting.data.role].filter(Boolean).join(" — ");
  const body = `# Keyword report${title ? `: ${title}` : ""}

Resume used: \`${variantName}\`
Current facts SHA256: ${hash(factsPath(person, root))}
Compared: ${compared}
Artifact identity: ${artifactIdentity}${artifact ? `\nArtifact SHA256: ${hash(artifact)}` : ""}${sourceRevision ? `\nSent source revision: ${sourceRevision}` : ""}

Source status reflects the current structured facts, not independent verification or historical qualification. Lexical presence does not establish required/preferred responsibility coverage, seniority, fit, or candidate beliefs. Review the official posting and original evidence. Held flags remain held until reconciled; confirmation references are leads, not automatic approval.
${ranking ? `\n## Variant ranking (no resume chosen yet)\n\n${ranking.map(r => `- \`${r.variant}\`: ${r.matched} matched`).join("\n")}\n` : ""}
## Matched terms (lexical presence with a confirmed source fact)

${list(matched)}

## In your facts but missing from this resume (confirmed source)

${list(missing)}

## Awaiting confirmation (not counted as confirmed)

${list(unconfirmed)}

## Posting terms with no evidence in your facts (honest gaps)

${list(gaps)}

## Relevant source facts absent from the comparison

${leads.length ? leads.map(f => `- ${f.id} [${f.state}] ${f.text}\n  References: ${reference(f)}${f.omission ? `\n  Deliberate omission: ${f.omission}` : "\n  Review relevance and recover supported content when material; omission alone is not a defect."}`).join("\n") : "- none"}

## Original source leads (presence only, not confirmed facts)

${sourceLeads.join("\n") || "- none found in the supplied source; this is not proof no other evidence exists"}

## Actual text review diff

${reviewDiff ? `Baseline: ${relative(root, resolve(opts.baseline!))}; SHA256: ${hash(resolve(opts.baseline!))}. Changed blocks retain any unchanged text between edits so ordering and duplicate lines remain visible.\n\nRemoved:\n${reviewDiff.removed.map(x => `- ${x}`).join("\n") || "- none"}\n\nAdded:\n${reviewDiff.added.map(x => `- ${x}`).join("\n") || "- none"}` : "Not performed: supply --baseline with the prior exact artifact. Text comparison does not replace visual layout or factual review."}
`;
  const data: Record<string, unknown> = { type: "keyword-report", person, resume: variantName, generated: new Date().toLocaleDateString("en-CA"), compared };
  if (posting.data.company) data.company = posting.data.company;
  if (posting.data.role) data.role = posting.data.role;
  const out = join(opts.reportDir ?? dir, FILE_NAMES.keywordReport);
  writeDoc(out, data, body);
  return { path: out, body, ranking, compared, matched, confirmedMissing: missing, unconfirmed, coverage, reviewDiff };
}

const command: Command = {
  name: "keywords",
  summary: "Review a posting against final resume content, the full fact inventory and original source leads",
  usage: "resumes keywords <application-dir> [--variant <name>] [--artifact <file.docx|file.pdf>] [--spec <file.yaml>] [--source <file>] [--baseline <file.docx|file.pdf>] [--omit <fact-id=reason>]",
  async run(argv) {
    const a = parseArgs(argv);
    if (!a._[0]) { console.error(`usage: ${command.usage}`); return 2; }
    const dir = resolve(a._[0]);
    if (!existsSync(dir)) { console.error(`${dir}: not found`); return 1; }
    try {
      for (const key of ["variant", "artifact", "spec", "source", "baseline", "omit"]) if (has(a, key) && !flag(a, key)) throw new Error(`--${key} needs a value`);
      const omit = flag(a, "omit");
      if (omit && (!omit.includes("=") || !omit.slice(omit.indexOf("=") + 1).trim())) throw new Error("--omit takes fact-id=reason");
      const omissions = omit ? { [omit.slice(0, omit.indexOf("="))]: omit.slice(omit.indexOf("=") + 1) } : undefined;
      const report = await keywordReport(dir, repoRoot(), flag(a, "variant"), { artifact: flag(a, "artifact"), spec: flag(a, "spec"), source: flag(a, "source"), baseline: flag(a, "baseline"), omissions });
      for (const r of report.ranking ?? []) console.log(`${r.variant}: ${r.matched} matched`);
      console.log(`wrote ${report.path}`);
      return 0;
    } catch (err) { console.error(err instanceof Error ? err.message : String(err)); return 1; }
  },
};
export default command;
