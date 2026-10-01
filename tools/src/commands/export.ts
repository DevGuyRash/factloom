import { flag, parseArgs } from "../lib/args.ts";
import { listApplications } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { resolvePerson } from "../lib/repo.ts";

function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FIELDS = ["company", "role", "status", "site", "source", "applied", "follow_up", "score", "resume", "cover_letter", "url", "updated"] as const;

/** One row per application from record frontmatter, as CSV or JSON. */
const command: Command = {
  name: "export",
  summary: "Export one row per application from record frontmatter, as CSV or JSON",
  usage: "resumes export [--format csv|json] [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const format = flag(a, "format") ?? "csv";
    if (format !== "csv" && format !== "json") throw new Error("--format must be csv or json");
    const rows = listApplications(person).map((x) => x.record).filter((r): r is NonNullable<typeof r> => r !== null);
    if (format === "json") {
      console.log(JSON.stringify(rows, null, 2));
      return 0;
    }
    console.log(FIELDS.join(","));
    for (const r of rows) console.log(FIELDS.map((f) => csvEscape((r as Record<string, unknown>)[f])).join(","));
    return 0;
  },
};
export default command;
