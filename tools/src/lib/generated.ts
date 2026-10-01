// Generated resumes: active variants whose guide says `generated: true`, built from resumes/source.
// Shared by the reproduction test and `resumes build-resumes --check` (which `resumes update` runs),
// which ask the same question: does this engine still render exactly the file that is there?
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { readDoc } from "./frontmatter.ts";
import { listPeople, personDir, repoRoot } from "./repo.ts";
import { render } from "../render/docx.ts";
import { stepByLabel, tighten, writeFitted } from "../render/fit.ts";
import { listVariants, loadFacts, loadVariant, resolveContent } from "../render/spec.ts";
import { loadTheme } from "../render/theme.ts";

export type Generated = { person: string; variant: string; docx: string };

/** Every generated resume under `root` that has a committed .docx. */
export function listGenerated(root = repoRoot()): Generated[] {
  const out: Generated[] = [];
  for (const person of listPeople(root)) {
    if (!existsSync(join(personDir(person, root), "resumes", "source", "variants"))) continue;
    for (const variant of listVariants(person, root)) {
      const active = join(personDir(person, root), "resumes", "active", variant);
      const guide = join(active, "guide.md");
      if (!existsSync(guide) || readDoc(guide).data.generated !== true) continue;
      const docx = join(active, `${loadVariant(person, variant, root).output}.docx`);
      if (existsSync(docx)) out.push({ person, variant, docx });
    }
  }
  return out;
}

/** A .docx's document XML with Word's random relationship ids removed, for exact comparison. */
export async function normalizedXml(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  return ((await zip.file("word/document.xml")?.async("string")) ?? "").replace(/r:id="[^"]*"/g, "").replace(/ Id="[^"]*"/g, "");
}

/** Renders a variant's .docx into `dir` the way a build would (a page target needs the full build, with PDFs). */
export async function renderDocx(person: string, variantName: string, dir: string, root = repoRoot()): Promise<string> {
  const variant = loadVariant(person, variantName, root);
  const theme = loadTheme(variant.theme, root, { person, overrides: variant.style });
  const content = resolveContent(loadFacts(person, root), variant);
  // A page target was met with the fitting step the build recorded in the guide; reuse it, so no PDF is needed.
  // Without a recorded step, measure the way a build does.
  if (variant.pages) {
    const guide = join(personDir(person, root), "resumes", "active", variantName, "guide.md");
    const recorded = existsSync(guide) ? readDoc(guide).data.fitted : undefined;
    const step = typeof recorded === "string" ? stepByLabel(recorded) : undefined;
    if (!step) return (await writeFitted(theme, content, dir, variant.output, variant.pages)).files.find((f) => f.endsWith(".docx"))!;
    const out = join(dir, `${variant.output}.docx`);
    await render(tighten(theme, step), content, out);
    return out;
  }
  const out = join(dir, `${variant.output}.docx`);
  await render(theme, content, out);
  return out;
}

/** The generated resumes this engine would render differently from their committed files. */
export async function staleGenerated(root = repoRoot()): Promise<(Generated & { fresh: string })[]> {
  const stale: (Generated & { fresh: string })[] = [];
  const tmp = mkdtempSync(join(tmpdir(), "generated-"));
  try {
    for (const g of listGenerated(root)) {
      const fresh = await renderDocx(g.person, g.variant, join(tmp, g.person, g.variant), root);
      if ((await normalizedXml(fresh)) !== (await normalizedXml(g.docx))) stale.push({ ...g, fresh });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return stale;
}
