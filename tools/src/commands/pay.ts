import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson } from "../lib/repo.ts";
import { aggregatePay } from "../lib/stats.ts";

/** Aggregates pay_min/pay_max/pay_period from posting snapshots (normalized to annual) into min/median/max, by variant, role, or site. */
const command: Command = {
  name: "pay",
  summary: "Aggregate posted pay into min/median/max, by variant, role, or site",
  usage: "resumes pay [--by variant|role|site] [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const by = (flag(a, "by") ?? "variant") as "variant" | "role" | "site";
    if (!["variant", "role", "site"].includes(by)) throw new Error("--by must be variant, role, or site");
    const rows = aggregatePay(person, by);
    if (!rows.length) {
      console.log("no pay data in posting snapshots");
      return 0;
    }
    console.log(`by ${by}:`);
    for (const r of rows) console.log(`${r.key.padEnd(24)} min=${r.min} median=${r.median} max=${r.max} (n=${r.n})`);
    return 0;
  },
};
export default command;
