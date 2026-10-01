// Agents and people run what the docs name, so a renamed or retired command must not linger there.
// In AGENTS.md, the READMEs, CONTRIBUTING.md, docs/, the skills' Markdown, and the justfile, every
// `resumes <command>` (in backticks, or at the start of a code line) must be a command the CLI
// provides, and every `python3|node|bash <script>` path must exist.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCommands } from "../lib/commands.ts";
import { rel as relTo } from "../lib/repo.ts";
import type { CheckContext, Rule } from "./types.ts";

const PROSE_COMMAND = /`(?:\.\/)?resumes ([a-z][a-z-]*)/g;
const CODE_COMMAND = /^\s*(?:\.\/)?resumes ([a-z][a-z-]*)/gm;
const SCRIPT = /(?:`|^\s*)(?:python3?|node|bash|sh) ((?:\.\/)?[\w./-]+\.(?:py|ts|js|cjs|mjs|sh))\b/gm;

function docFiles(root: string): string[] {
  const out = ["AGENTS.md", "README.md", "CONTRIBUTING.md", "tools/README.md", "custom/README.md", "examples/demo/README.md", "justfile"].map((f) => join(root, f)).filter((p) => existsSync(p));
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(join(root, ".agents", "skills"));
  walk(join(root, "docs"));
  return out;
}

/** Markdown splits into prose and fenced code; any other file (the justfile) is all code. */
function split(file: string, text: string): { prose: string; code: string } {
  if (!file.endsWith(".md")) return { prose: "", code: text };
  const parts = text.split(/^```.*$/m);
  return { prose: parts.filter((_, i) => i % 2 === 0).join("\n"), code: parts.filter((_, i) => i % 2 === 1).join("\n") };
}

const rule: Rule = {
  name: "doc-commands",
  async run(ctx: CheckContext) {
    const commands = new Set(["help", ...(await loadCommands()).keys()]);
    const errors: string[] = [];
    for (const file of docFiles(ctx.root)) {
      const text = readFileSync(file, "utf8");
      const rel = relTo(file, ctx.root);
      const { prose, code } = split(file, text);
      const named = new Set([...prose.matchAll(PROSE_COMMAND), ...code.matchAll(CODE_COMMAND)].map((m) => m[1]));
      for (const name of named) if (!commands.has(name)) errors.push(`${rel}: \`resumes ${name}\` is not a command (\`./resumes help\` lists them)`);
      for (const m of new Set([...text.matchAll(SCRIPT)].map((m) => m[1]))) {
        const found = [join(dirname(file), m), join(ctx.root, m), join(ctx.root, "tools", m)].some((p) => existsSync(p));
        if (!found) errors.push(`${rel}: \`${m}\` does not exist`);
      }
    }
    return { errors, warnings: [] };
  },
};
export default rule;
