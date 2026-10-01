// Each application gets its own correctly named directory holding exactly one application
// record. Application directories may otherwise contain any files (posting snapshot, cover
// letter, etc. — see cover-letter-lint.ts for the letter-specific checks).
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { isApplicationDirName } from "../lib/applications.ts";
import type { CheckContext, Rule } from "./types.ts";

const rule: Rule = {
  name: "applications",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    const peopleDir = join(ctx.root, "people");
    if (!existsSync(peopleDir)) return { errors, warnings: [] };
    for (const person of readdirSync(peopleDir)) {
      const apps = join(peopleDir, person, "applications");
      if (!existsSync(apps)) continue;
      for (const name of readdirSync(apps).sort()) {
        const adir = join(apps, name);
        const shown = `people${sep}${person}${sep}applications${sep}${name}`;
        if (!statSync(adir).isDirectory()) {
          errors.push(`${shown}: each application gets its own directory`);
          continue;
        }
        if (!isApplicationDirName(name)) errors.push(`${shown}: name applications YYYY-MM-DD_company-slug_role-slug (lowercase, hyphens)`);
        const records = ctx.docs.filter((d) => dirname(d.path) === adir && d.data?.type === "application");
        if (records.length !== 1) errors.push(`${shown}: needs exactly one application record, found ${records.length}`);
      }
    }
    return { errors, warnings: [] };
  },
};
export default rule;
