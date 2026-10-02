// Importing resumes someone already has: from the drop/ folder by default, or from given files and
// folders, in any format. The mechanical part lives in lib/intake.ts; turning the text into facts is
// a judgment the agent makes with the person (the job-application skill's intake reference).
import { resolve } from "node:path";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { DROP_DIR, dropSources, importedNotes, importFile, type ImportOutcome, intakePerson, scanIntake, shown, type Skipped } from "../lib/intake.ts";
import { rel, repoRoot } from "../lib/repo.ts";

/** Imports one file and returns its note and archived original; kept for callers that import a single readable resume. */
export async function importResume(file: string, person: string, root = repoRoot()): Promise<{ note: string; original: string }> {
  const r = await importFile(resolve(file), person, root, { keep: true });
  if (r.outcome === "duplicate") throw new Error(`${file}: already imported as ${rel(r.note!, root)}`);
  return { note: r.note!, original: r.original! };
}

function describe(r: ImportOutcome, root: string): string {
  const from = shown(r.file, root);
  if (r.outcome === "duplicate") return `= ${from}: already imported (${rel(r.note!, root)})`;
  if (r.outcome === "restored") return `= ${from}: already imported (${rel(r.note!, root)}); its archived original was missing and is back at ${rel(r.original!, root)}`;
  const held = r.sidecar ? `; lines with personal details (${r.heldKinds!.join(", ")}) held in ${rel(r.sidecar, root)}` : "";
  if (r.outcome === "needs-reading") return `? ${from}: no text could be extracted; the agent reads ${rel(r.original!, root)} and fills ${rel(r.note!, root)}`;
  return `+ ${from}: text (${r.method}) in ${rel(r.note!, root)}${held}`;
}

const USAGE = "resumes import [<file-or-folder> ...] [--person <slug>] [--keep] | import status [--person <slug>]";

const command: Command = {
  name: "import",
  summary: `Import existing resumes in any format (from ${DROP_DIR}/ by default): archive each original, extract its text, and mark what the agent must read`,
  usage: USAGE,
  async run(argv) {
    const a = parseArgs(argv, ["keep"]);
    const root = repoRoot();

    if (a._[0] === "status") {
      let person: string | null = null;
      try {
        person = intakePerson(flag(a, "person"), root);
      } catch (e) {
        if (flag(a, "person")) {
          console.error(e instanceof Error ? e.message : String(e));
          return 2;
        }
      }
      const waiting = dropSources(person, root).files;
      console.log(`${DROP_DIR}/: ${waiting.length} file(s) waiting${person ? ` for ${person}` : ""}`);
      for (const f of waiting) console.log(`  - ${shown(f, root)}`);
      if (!person) {
        console.log("pass --person to see imported resumes");
        return 0;
      }
      const notes = importedNotes(person, root);
      console.log(`imported resumes for ${person}: ${notes.length}`);
      for (const n of notes) console.log(`  - ${n.status.padEnd(13)} ${rel(n.path, root)}${n.name ? ` (${n.name})` : ""}`);
      return 0;
    }

    let person: string;
    try {
      person = intakePerson(flag(a, "person"), root);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 2;
    }
    const { files, skipped }: { files: string[]; skipped: Skipped[] } = a._.length ? scanIntake(a._.map((p) => resolve(p)), root) : dropSources(person, root);
    for (const s of skipped) console.log(`- ${shown(s.path, root)}: skipped (${s.reason})`);
    if (!files.length) {
      console.log(a._.length ? "no files found" : `${DROP_DIR}/ is empty: put resumes there (any format), or pass files or folders`);
      return 0;
    }

    const results: ImportOutcome[] = [];
    let failed = 0;
    for (const file of files) {
      try {
        const r = await importFile(file, person, root, { keep: has(a, "keep") });
        results.push(r);
        console.log(describe(r, root));
      } catch (e) {
        failed++;
        console.error(`! ${shown(file, root)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const count = (o: ImportOutcome["outcome"]) => results.filter((r) => r.outcome === o).length;
    console.log(`${count("imported")} imported, ${count("needs-reading")} need reading by the agent, ${count("duplicate") + count("restored")} already imported${failed ? `, ${failed} failed (left where they were)` : ""}`);
    if (count("imported") + count("needs-reading")) console.log("next: the job-application skill's intake reference (read, reconcile, write facts.yaml)");
    return failed ? 1 : 0;
  },
};
export default command;
