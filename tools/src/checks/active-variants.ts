// Each active resume variant directory holds exactly one resume guide and at least one .pdf or
// .docx, files only (no subdirectories, no stray extensions), and resume text free of draft
// markers.
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { extractDocumentText } from "../lib/pii.ts";
import { DRAFT_MARKERS, RESUME_EXTENSIONS } from "../lib/schema.ts";
import type { CheckContext, Rule } from "./types.ts";

const rule: Rule = {
  name: "active-variants",
  async run(ctx: CheckContext) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const peopleDir = join(ctx.root, "people");
    if (!existsSync(peopleDir)) return { errors, warnings };
    for (const person of readdirSync(peopleDir)) {
      const active = join(peopleDir, person, "resumes", "active");
      if (!existsSync(active)) continue;
      for (const variant of readdirSync(active).sort()) {
        const vdir = join(active, variant);
        const shown = `people${sep}${person}${sep}resumes${sep}active${sep}${variant}`;
        if (!statSync(vdir).isDirectory()) {
          errors.push(`${shown}: active resumes live in one directory per variant`);
          continue;
        }
        const entries = readdirSync(vdir);
        const guides = entries.filter((f) => f.endsWith(".md") && ctx.byPath.get(join(vdir, f))?.data?.type === "resume-guide");
        const resumes = entries.filter((f) => (RESUME_EXTENSIONS as readonly string[]).includes(extname(f).toLowerCase()));
        if (guides.length !== 1) errors.push(`${shown}: needs exactly one resume guide, found ${guides.length}`);
        if (!resumes.length) errors.push(`${shown}: needs a .pdf or .docx resume`);
        for (const f of entries) {
          const fp = join(vdir, f);
          if (statSync(fp).isDirectory()) errors.push(`${shown}/${f}: variant directories hold files only`);
          else if (![...RESUME_EXTENSIONS, ".md"].includes(extname(f).toLowerCase())) errors.push(`${shown}/${f}: unexpected file type in an active variant`);
        }
        for (const f of resumes) {
          const text = await extractDocumentText(join(vdir, f));
          if (text == null) {
            warnings.push(`${shown}/${f}: text not checked (no PDF text extractor available)`);
            continue;
          }
          const hit = text.match(DRAFT_MARKERS);
          if (hit) errors.push(`${shown}/${f}: resume text contains '${hit[0]}'`);
        }
      }
    }
    return { errors, warnings };
  },
};
export default rule;
