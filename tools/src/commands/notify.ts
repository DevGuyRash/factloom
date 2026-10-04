import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { notify } from "../lib/notify.ts";

/** `notify <message> [--title T] [--dry-run]`: ntfy, else notify-send, else print. */
const command: Command = {
  name: "notify",
  summary: "Send a notification (ntfy if RESUMES_NTFY_URL is set, else notify-send, else print)",
  usage: "resumes notify <message> [--title <text>] [--dry-run]",
  async run(argv) {
    const a = parseArgs(argv, ["dry-run"]);
    const message = a._.join(" ");
    if (!message) { console.error(`usage: ${command.usage}`); return 2; }
    const result = await notify(message, { title: flag(a, "title"), dryRun: has(a, "dry-run") });
    // Printing reaches nobody who is away: say so, so the message also goes in the run's summary.
    if (!result.dryRun) console.error(result.via === "print" ? "(not delivered: set RESUMES_NTFY_URL, or install notify-send, to reach the person; the message was only printed here)" : `(sent via ${result.via})`);
    return 0;
  },
};
export default command;
