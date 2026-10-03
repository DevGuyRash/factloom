// Prints the tab-completion script for a shell. The scripts (tools/completions/) are thin: they call
// `resumes __complete`, so commands, flags, and the repository's people, variants, and themes are always
// current and nothing needs regenerating after an update. docs/completion.md says where to load them.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "../lib/command.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "completions");
export const SHELLS: Record<string, string> = { bash: "resumes.bash", zsh: "resumes.zsh", fish: "resumes.fish", powershell: "resumes.ps1" };
const ALIASES: Record<string, string> = { pwsh: "powershell" };

const command: Command = {
  name: "completion",
  summary: "Print the tab-completion script for bash, zsh, fish, or PowerShell",
  usage: "resumes completion bash|zsh|fish|powershell   (docs/completion.md says where to load it)",
  run(argv) {
    const shell = ALIASES[argv[0] ?? ""] ?? argv[0] ?? "";
    const file = SHELLS[shell];
    if (!file || !existsSync(join(DIR, file))) {
      console.error(`usage: resumes completion ${Object.keys(SHELLS).join("|")}\nTry: source <(resumes completion bash)   (see docs/completion.md for each shell)`);
      return 2;
    }
    process.stdout.write(readFileSync(join(DIR, file), "utf8"));
    return 0;
  },
};
export default command;
