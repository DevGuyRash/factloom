import { flag, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { APPLICATION_LOCATION_FIELDS, APPLICATION_CONTACT_FIELDS } from "../lib/schema.ts";
import { resolvePerson } from "../lib/repo.ts";

function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FIELDS = ["company", "role", "status", "site", "source", "applied", "follow_up", "score", "resume", "cover_letter", "url", "updated", "contact_method", "date_contacted", "hired", "start_date", "started",
  ...APPLICATION_LOCATION_FIELDS.map((f) => `address_of_record.${f}`),
  ...APPLICATION_LOCATION_FIELDS.map((f) => `alternate_location.${f}`),
  ...APPLICATION_CONTACT_FIELDS.map((f) => `contact.${f}`), "events", "record_notes"] as const;

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
    const rows = listApplications(person).filter((x) => x.record !== null).map((x) => {
      const { data, body } = loadRecord(x);
      const notes = body.match(/^## Notes[^\S\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.replace(/<!--[\s\S]*?-->/g, "").trim() ?? "";
      return { ...data, record_notes: notes };
    });
    if (format === "json") {
      console.log(JSON.stringify(rows, null, 2));
      return 0;
    }
    console.log(FIELDS.join(","));
    for (const r of rows) console.log(FIELDS.map((f) => {
      const value = f.split(".").reduce<unknown>((v, k) => v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined, r);
      return csvEscape(value && typeof value === "object" ? JSON.stringify(value) : value);
    }).join(","));
    return 0;
  },
};
export default command;
