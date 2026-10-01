// Each `### <id>` entry in an `answers` doc names a known policy and has an `- Answer:` line;
// an entry with an empty answer is a warning, not an error (it is waiting on the person, not broken).
import { POLICIES } from "../lib/schema.ts";
import type { CheckContext, Rule } from "./types.ts";

const rule: Rule = {
  name: "answers",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const doc of ctx.byType("answers")) {
      const entries = doc.body.split(/^### /m).slice(1);
      let unanswered = 0;
      for (const entry of entries) {
        const ident = (entry.split("\n")[0] ?? "").trim();
        const pol = entry.match(/^- Policy:\s*(\S*)/m);
        const ans = entry.match(/^- Answer:[ \t]*(.*)$/m);
        const polValue = pol?.[1]?.replace(/`/g, "") ?? "";
        if (!pol || !(POLICIES as readonly string[]).includes(polValue)) {
          errors.push(`${doc.rel}: '${ident}' needs '- Policy:' set to one of ${[...POLICIES].sort().join(", ")}`);
        }
        if (!ans) errors.push(`${doc.rel}: '${ident}' needs an '- Answer:' line`);
        else if (!ans[1].trim()) unanswered++;
      }
      if (unanswered) warnings.push(`${doc.rel}: ${unanswered} saved entr${unanswered === 1 ? "y has" : "ies have"} no answer`);
    }
    return { errors, warnings };
  },
};
export default rule;
