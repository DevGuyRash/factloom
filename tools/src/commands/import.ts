// Importing a resume someone already has (Word, PDF, or text): keeps the original in their archive
// and writes its text as a note beside resumes/source/, so an agent can write facts.yaml from it.
// Nothing here guesses at structure; turning text into facts is a judgment the agent makes with the
// person (see the job-application skill's resumes reference).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { extractDocumentText } from "../lib/pii.ts";
import { personDir, rel, repoRoot, resolvePerson, today } from "../lib/repo.ts";
import { slugify } from "../lib/text.ts";

export async function importResume(file: string, person: string, root = repoRoot()): Promise<{ note: string; original: string }> {
  if (!existsSync(file)) throw new Error(`${file}: not found`);
  const ext = extname(file).toLowerCase();
  let text: string | null;
  if ([".txt", ".md"].includes(ext)) text = readFileSync(file, "utf8");
  else if ([".docx", ".pdf"].includes(ext)) text = await extractDocumentText(file);
  else throw new Error(`${file}: import reads .docx, .pdf, .txt, or .md (save other formats as one of those first)`);
  if (!text || !text.trim()) throw new Error(`${file}: no text found (a scanned PDF needs to be retyped or run through OCR first)`);

  const dir = personDir(person, root);
  const stem = slugify(basename(file, ext)) || "resume";
  const archive = join(dir, "resumes", "archive");
  mkdirSync(archive, { recursive: true });
  const original = join(archive, `${today()}_${stem}${ext}`);
  copyFileSync(file, original);

  const note = join(dir, "resumes", "source", "imported", `${today()}_${stem}.md`);
  mkdirSync(join(note, ".."), { recursive: true });
  writeDoc(note, { type: "notes", person, source: rel(original, root), imported: today() }, `
# Imported resume text

Text extracted from \`${basename(file)}\` (original kept at \`${rel(original, root)}\`). Write
\`resumes/source/facts.yaml\` from it: keep each claim as the person wrote it, mark any number or claim
you reword or cannot verify with \`confirm\`, then create variants with \`./resumes variant new\` and
compare the built resume with the original before using it.

\`\`\`text
${text.trim()}
\`\`\`
`);
  return { note, original };
}

const command: Command = {
  name: "import",
  summary: "Import an existing resume (.docx, .pdf, .txt): archive the original and extract its text for writing facts.yaml",
  usage: "resumes import <file> [--person <slug>]",
  async run(argv) {
    const a = parseArgs(argv);
    const file = a._[0];
    if (!file) { console.error(`usage: ${command.usage}`); return 2; }
    const root = repoRoot();
    try {
      const { note, original } = await importResume(file, resolvePerson(flag(a, "person"), root), root);
      console.log(`kept the original at ${rel(original, root)}`);
      console.log(`wrote its text to ${rel(note, root)}; write resumes/source/facts.yaml from it`);
      return 0;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 1;
    }
  },
};
export default command;
