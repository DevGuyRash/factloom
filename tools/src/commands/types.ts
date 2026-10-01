import type { Command } from "../lib/command.ts";
import { DOC_TYPES, ENUMS, FILE_NAMES } from "../lib/schema.ts";

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
    console.log("\nconventional file names:");
    for (const [k, v] of Object.entries(FILE_NAMES)) console.log(`  ${k.padEnd(16)} ${v}`);
    return 0;
  },
};
export default command;
