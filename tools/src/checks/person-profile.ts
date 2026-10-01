// Each person directory holds exactly one `profile` doc.
import { sep } from "node:path";
import { listPeople } from "../lib/repo.ts";
import type { CheckContext, Rule } from "./types.ts";

const rule: Rule = {
  name: "person-profile",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    for (const person of listPeople(ctx.root)) {
      const prefix = `people${sep}${person}${sep}`;
      const profiles = ctx.docs.filter((d) => d.rel.startsWith(prefix) && d.data?.type === "profile");
      if (profiles.length !== 1) errors.push(`people/${person}: needs exactly one profile, found ${profiles.length}`);
    }
    return { errors, warnings: [] };
  },
};
export default rule;
