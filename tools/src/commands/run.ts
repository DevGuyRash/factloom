import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { rel, resolvePerson } from "../lib/repo.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { activeRun, endRun, logEvent, startRun } from "../lib/runlog.ts";

const KINDS = ["applied", "held", "skipped", "error", "note"] as const;
type Kind = (typeof KINDS)[number];

/** Tracks one work session: `start` opens a run log, `log` appends a timestamped line and bumps its counts, `end` closes it. */
const command: Command = {
  name: "run",
  summary: "Track a work session in a run log: start, log an event, end",
  usage: [
    "resumes run start [--takeover] [--person p]",
    'resumes run log --kind note|error|applied|held|skipped "message" [--person p]',
    "resumes run end [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest, ["takeover"]);
    const person = resolvePerson(flag(a, "person"));

    if (sub === "start") {
      const minutes = loadPipelineConfig().run_active_minutes;
      const active = activeRun(person, minutes);
      if (active && !has(a, "takeover")) {
        console.error(
          `a run log is still open: ${rel(active.path)} was written at ${active.lastWrite.toISOString()}, within ${minutes} minutes. ` +
            "If it is your own, from an earlier turn of this same conversation (a host that continues one thread), that turn has stopped: `run start --takeover`. " +
            "If another agent or process may be working in this browser and queue, end this activation without changes, since two runs collide.",
        );
        return 1;
      }
      console.log(rel(startRun(person)));
      return 0;
    }
    if (sub === "log") {
      const kind = flag(a, "kind");
      const message = a._[0];
      if (!kind || !(KINDS as readonly string[]).includes(kind) || !message) throw new Error(`run log needs --kind ${KINDS.join("|")} and a message`);
      console.log(rel(logEvent(person, kind as Kind, message)));
      // app submit/hold/skip and queue skip log their own outcomes, one line per posting, so counts stay true.
      if (kind !== "note" && kind !== "error") console.error("note: app submit, hold, and skip and queue skip log outcomes themselves; log one posting per line, or the counts drift");
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
