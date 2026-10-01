#!/usr/bin/env node
// Entry point: `node tools/src/cli.ts <command> [args]`. Commands are discovered from src/commands/*.ts,
// so adding a command never touches this file.
import { pathToFileURL } from "node:url";
import { loadCommands } from "./lib/commands.ts";

async function main(argv: string[]): Promise<number> {
  const commands = await loadCommands();
  const [name, ...rest] = argv;
  const cmd = name ? commands.get(name) : undefined;
  if (!cmd || name === "help" || name === "--help") {
    const target = rest[0] && commands.get(rest[0]);
    if (target) { console.log(`${target.name}: ${target.summary}\n\nusage: ${target.usage}`); return 0; }
    console.log("usage: resumes <command> [args]\n");
    for (const c of [...commands.values()].sort((a, b) => a.name.localeCompare(b.name))) console.log(`  ${c.name.padEnd(16)} ${c.summary}`);
    return name && name !== "help" && name !== "--help" ? 2 : 0;
  }
  return await cmd.run(rest);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
