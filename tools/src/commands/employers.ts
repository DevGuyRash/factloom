import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { blockEmployer, findEmployer, loadEmployers, priorityEmployer } from "../lib/employers.ts";
import { resolvePerson } from "../lib/repo.ts";

/** Checks, lists, blocks, or priority-marks employers (people/<person>/employers.md), matched by normalizeCompany. */
const command: Command = {
  name: "employers",
  summary: "Check, list, block, or priority-mark employers",
  usage: [
    "resumes employers check <name> [--person p]",
    "resumes employers list [--person p]",
    "resumes employers block <name> [--reason TEXT] [--person p]",
    "resumes employers priority <name> [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest);
    const person = resolvePerson(flag(a, "person"));
    const name = a._[0];

    if (sub === "check") {
      if (!name) throw new Error("employers check needs <name>");
      const e = findEmployer(person, name);
      console.log(e ? `${e.company}: blocked=${!!e.blocked}${e.reason ? ` (${e.reason})` : ""} priority=${!!e.priority}${e.notes ? ` notes=${e.notes}` : ""}` : `${name}: no record`);
      return 0;
    }
    if (sub === "list") {
      for (const e of loadEmployers(person).items) console.log(`${e.company}: blocked=${!!e.blocked}${e.reason ? ` (${e.reason})` : ""} priority=${!!e.priority}`);
      return 0;
    }
    if (sub === "block") {
      if (!name) throw new Error("employers block needs <name>");
      blockEmployer(person, name, flag(a, "reason"));
      console.log(`blocked ${name}`);
      return 0;
    }
    if (sub === "priority") {
      if (!name) throw new Error("employers priority needs <name>");
      priorityEmployer(person, name);
      console.log(`priority ${name}`);
      return 0;
    }
    console.error(`unknown employers subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
