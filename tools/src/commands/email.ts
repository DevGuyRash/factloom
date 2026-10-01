import { readFileSync } from "node:fs";
import { parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { classifyEmail, extractCodes } from "../lib/email.ts";

function readInput(fileOrDash: string): string {
  if (fileOrDash === "-") return readFileSync(0, "utf8");
  return readFileSync(fileOrDash, "utf8");
}

/** `email classify|codes <file|->`: pure text classification, no mailbox access. */
const command: Command = {
  name: "email",
  summary: "Classify an email's purpose, or extract verification codes/links, from text",
  usage: "resumes email classify <file|-> | resumes email codes <file|->",
  run(argv) {
    const a = parseArgs(argv);
    const [sub, source] = a._;
    if (!sub || !source) { console.error(`usage: ${command.usage}`); return 2; }
    const text = readInput(source);
    if (sub === "classify") {
      const r = classifyEmail(text);
      console.log(`${r.category}\t${r.confidence.toFixed(2)}`);
      return 0;
    }
    if (sub === "codes") {
      const r = extractCodes(text);
      for (const c of r.codes) console.log(`code\t${c}`);
      for (const l of r.links) console.log(`link\t${l}`);
      return 0;
    }
    console.error(`unknown subcommand ${sub}; usage: ${command.usage}`);
    return 2;
  },
};
export default command;
