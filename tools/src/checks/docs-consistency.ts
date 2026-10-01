// schema.ts's DOC_TYPES is the single source of truth for document types; AGENTS.md's type table
// is documentation that can drift from it. Warn (never error — the schema wins) when a type has
// no mention in AGENTS.md.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOC_TYPES } from "../lib/schema.ts";
import type { CheckContext, Rule } from "./types.ts";

const rule: Rule = {
  name: "docs-consistency",
  run(ctx: CheckContext) {
    const warnings: string[] = [];
    const path = join(ctx.root, "AGENTS.md");
    if (!existsSync(path)) return { errors: [], warnings };
    const text = readFileSync(path, "utf8");
    for (const type of Object.keys(DOC_TYPES)) {
      if (!text.includes(`\`${type}\``)) warnings.push(`AGENTS.md: doc type '${type}' is not listed in the type table`);
    }
    return { errors: [], warnings };
  },
};
export default rule;
