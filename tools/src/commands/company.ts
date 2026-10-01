import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { createCompany, findCompany, listCompanies } from "../lib/companies.ts";
import { rel } from "../lib/repo.ts";

/** Company dossiers: `company new|find|list`. Dossiers are shared across every person. */
const command: Command = {
  name: "company",
  summary: "Create, find, or list company dossiers (custom/companies/)",
  usage: "resumes company new <Name> [--website <URL>] | resumes company find <Name> | resumes company list",
  run(argv) {
    const a = parseArgs(argv);
    const [sub, ...rest] = a._;
    if (sub === "list" || !sub) {
      for (const c of listCompanies()) console.log(`${c.slug.padEnd(28)} ${rel(c.path)}`);
      return 0;
    }
    if (sub === "find") {
      if (!rest[0]) { console.error("usage: resumes company find <Name>"); return 2; }
      const hit = findCompany(rest.join(" "));
      if (hit) console.log(rel(hit.path));
      return 0;
    }
    if (sub === "new") {
      if (!rest[0]) { console.error("usage: resumes company new <Name> [--website <URL>]"); return 2; }
      const website = flag(a, "website");
      const company = createCompany(rest.join(" "), { website });
      console.log(`wrote ${rel(company.path)}`);
      return 0;
    }
    console.error(`unknown subcommand ${sub}; usage: ${command.usage}`);
    return 2;
  },
};
export default command;
