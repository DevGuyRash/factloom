// The tab-completion endpoint the scripts from `resumes completion` call:
//   resumes __complete --cur=<word under the cursor> -- <words typed before it> ...
// It prints one candidate per line (`value`, or `value<TAB>description`), then a last line saying what
// the shell does next: `:none`, `:files`, or `:dirs` (its own file or directory completion). The word
// under the cursor travels as --cur=<word> because it is often empty, and PowerShell drops empty
// arguments. Whatever goes wrong it prints `:none` and exits 0: completion must never show an error.
import type { Command } from "../lib/command.ts";
import { complete, type Completion } from "../lib/complete.ts";
import { loadCommands } from "../lib/commands.ts";

const clean = (s: string): string => s.replace(/[\t\r\n]+/g, " ").trim();

const command: Command = {
  name: "__complete",
  hidden: true,
  summary: "Answer a shell's tab-completion request (used by the scripts from `resumes completion`)",
  usage: "resumes __complete --cur=<word> [-- <earlier-word> ...]",
  async run(argv) {
    const dash = argv.indexOf("--");
    const cur = argv.find((a, i) => a.startsWith("--cur=") && (dash < 0 || i < dash))?.slice("--cur=".length) ?? "";
    const earlier = dash >= 0 ? argv.slice(dash + 1) : [];
    const words = [...earlier, cur];
    let result: Completion = { candidates: [], fallback: "none" };
    try {
      result = complete(words, await loadCommands());
    } catch {
      // answered below as no candidates
    }
    const lines = result.candidates.map((c) => (c.description ? `${c.value}\t${clean(c.description)}` : c.value));
    process.stdout.write(`${[...lines, `:${result.fallback}`].join("\n")}\n`);
    return 0;
  },
};
export default command;
