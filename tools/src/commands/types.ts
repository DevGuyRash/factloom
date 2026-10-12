import type { Command } from "../lib/command.ts";
import { APPLICATION_CONTACT_FIELDS, APPLICATION_EVENT_KINDS, APPLICATION_LOCATION_FIELDS, DOC_TYPES, ENUMS, FILE_NAMES } from "../lib/schema.ts";

/** Prints the document model from schema.ts, the single place it is defined. */
const command: Command = {
  name: "types",
  summary: "List document types, their required fields, enumerations, and conventional file names",
  usage: "resumes types",
  run() {
    for (const [type, fields] of Object.entries(DOC_TYPES)) {
      const enums = ENUMS.filter((e) => e.type === type).map((e) => `${e.field}: ${e.values.join("|")}`);
      console.log(`${type.padEnd(20)} ${fields.length ? fields.join(", ") : "-"}${enums.length ? `   [${enums.join("; ")}]` : ""}`);
    }
    console.log("\noptional application fields (older records need no migration):");
    console.log(`  company = employer; role = job title; status also accepts lowercase-hyphenated slugs declared in custom_statuses by outcome --custom`);
    console.log(`  address_of_record, alternate_location: ${APPLICATION_LOCATION_FIELDS.join(", ")} (text; missing = unknown)`);
    console.log(`  contact: ${APPLICATION_CONTACT_FIELDS.join(", ")}; contact_method: text`);
    console.log("  date_contacted, hired, start_date (planned), started (actual): YYYY-MM-DD");
    console.log("  events[]: kind, on (date/datetime), recorded_at (datetime); optional status, note, at, replaces, round, contact_method, start_date");
    console.log(`  event kinds: ${APPLICATION_EVENT_KINDS.join(", ")}, outcome status, or custom slug`);
    console.log("\nconventional file names:");
    for (const [k, v] of Object.entries(FILE_NAMES)) console.log(`  ${k.padEnd(16)} ${v}`);
    return 0;
  },
};
export default command;
