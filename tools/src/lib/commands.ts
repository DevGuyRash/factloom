// Command discovery, shared by the CLI and the checks: one module per file in src/commands/, keyed by
// its `name` (which can differ from the file name), so adding a command never touches another file.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "./command.ts";

const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");

export async function loadCommands(dir = COMMANDS_DIR): Promise<Map<string, Command>> {
  const out = new Map<string, Command>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)) as { default?: Command };
    if (mod.default?.name) out.set(mod.default.name, mod.default);
  }
  return out;
}
