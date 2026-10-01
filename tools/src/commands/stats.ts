import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson } from "../lib/repo.ts";
import { computeStats, type GroupCounts } from "../lib/stats.ts";

function printGroup(title: string, map: Record<string, GroupCounts>) {
  console.log(`-- ${title} --`);
  const rate = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
  for (const [key, c] of Object.entries(map).sort(([x], [y]) => x.localeCompare(y))) {
    console.log(`${key.padEnd(24)} n=${c.total} responded=${c.responded} (${rate(c.responded, c.total)}) interview=${c.interview} (${rate(c.interview, c.total)})`);
  }
}

/** Response and interview rates by resume variant, cover-letter use, source, and site, with counts so small samples stay visible. */
const command: Command = {
  name: "stats",
  summary: "Response and interview rates by resume variant, cover letter, source, and site",
  usage: "resumes stats [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const report = computeStats(person);
    printGroup("by resume variant", report.byVariant);
    printGroup("by cover letter", report.byCoverLetter);
    printGroup("by source", report.bySource);
    printGroup("by site", report.bySite);
    return 0;
  },
};
export default command;
