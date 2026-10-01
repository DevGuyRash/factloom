// Every Markdown doc's frontmatter: known `type`, that type's required fields present, enum
// fields valid, `person` matching its directory, and date-shaped fields parsing as dates. All
// read from schema.ts so this stays in sync with the rest of the tools automatically.
import { sep } from "node:path";
import { DATE, DOC_TYPES, ENUMS, isDocType } from "../lib/schema.ts";
import type { CheckContext, Rule } from "./types.ts";

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return true;
  return DATE.test(String(v ?? ""));
}

const rule: Rule = {
  name: "frontmatter-types",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const doc of ctx.docs) {
      if (doc.parseError) {
        errors.push(`${doc.rel}: frontmatter does not parse (${doc.parseError})`);
        continue;
      }
      if (!doc.data) continue; // no frontmatter at all is not itself an error
      const t = doc.data.type;
      if (!isDocType(t)) {
        errors.push(`${doc.rel}: unknown type '${String(t)}' (known: ${Object.keys(DOC_TYPES).sort().join(", ")})`);
        continue;
      }
      for (const field of DOC_TYPES[t]) {
        if (isEmpty(doc.data[field])) errors.push(`${doc.rel}: ${t} needs '${field}'`);
      }
      for (const e of ENUMS) {
        if (e.type !== t) continue;
        const val = doc.data[e.field];
        if (isEmpty(val)) continue;
        if (!(e.values as readonly string[]).includes(String(val))) {
          errors.push(`${doc.rel}: ${e.field} '${String(val)}' is not one of [${[...e.values].sort().join(", ")}]`);
        }
      }
      const parts = doc.rel.split(sep);
      if (parts[0] === "people" && parts.length > 2 && !isEmpty(doc.data.person) && doc.data.person !== parts[1]) {
        errors.push(`${doc.rel}: person '${String(doc.data.person)}' does not match directory '${parts[1]}'`);
      }
      if (t === "application" && !isEmpty(doc.data.updated) && !isDateLike(doc.data.updated)) {
        errors.push(`${doc.rel}: updated must be YYYY-MM-DD`);
      }
    }
    return { errors, warnings };
  },
};
export default rule;
