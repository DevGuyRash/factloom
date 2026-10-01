import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { rel, resolvePerson } from "../lib/repo.ts";
import { endRun, logEvent, startRun } from "../lib/runlog.ts";

const KINDS = ["applied", "held", "skipped", "error", "note"] as const;
type Kind = (typeof KINDS)[number];

/** Tracks one work session: `start` opens a run log, `log` appends a timestamped line and bumps its counts, `end` closes it. */
const command: Command = {
  name: "run",
  summary: "Track a work session in a run log: start, log an event, end",
  usage: [
    "resumes run start [--person p]",
    'resumes run log --kind applied|held|skipped|error|note "message" [--person p]',
    "resumes run end [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest);
    const person = resolvePerson(flag(a, "person"));

    if (sub === "start") {
      console.log(rel(startRun(person)));
      return 0;
    }
    if (sub === "log") {
      const kind = flag(a, "kind");
      const message = a._[0];
      if (!kind || !(KINDS as readonly string[]).includes(kind) || !message) throw new Error(`run log needs --kind ${KINDS.join("|")} and a message`);
      console.log(rel(logEvent(person, kind as Kind, message)));
      return 0;
    }
    if (sub === "end") {
      const path = endRun(person);
      if (!path) {
        console.error("no running log to end");
        return 1;
      }
      console.log(rel(path));
      return 0;
    }
    console.error(`unknown run subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
