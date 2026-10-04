import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { customDir, dataLayers } from "../lib/layers.ts";
import { rel, repoRoot, today } from "../lib/repo.ts";

const HEADER = "---\ntype: site-notes\n---\n\n# Site notes\n\nThis repository's own observations about job sites and applicant systems, dated, grouped by site. They add to the engine's shared/site-notes.md. Managed by `resumes sitenote`; keep personal details out.\n";

/** The `## <site>` sections of a notes file whose heading names the site. */
function sections(text: string, site: string): string[] {
  const key = site.trim().toLowerCase();
  return text.split(/^(?=## )/m).filter((s) => s.startsWith("## ") && s.split("\n")[0].toLowerCase().includes(key)).map((s) => s.trimEnd());
}

/**
 * Site notes while working, not only at the end of a session: `sitenote <site>` prints what the notes say about a
 * site (the engine's and this repository's), and `sitenote <site> "<text>"` adds a dated line under that site's
 * heading in custom/site-notes.md, starting the section or the file when needed.
 */
const command: Command = {
  name: "sitenote",
  summary: "Read the site notes for one site, or add a dated note to it",
  usage: 'resumes sitenote <site> ["<note>"]',
  run(argv) {
    const a = parseArgs(argv);
    const [site, ...words] = a._;
    if (!site) throw new Error('sitenote needs <site> (and a "<note>" to add one)');
    const root = repoRoot();
    if (!words.length) {
      let found = 0;
      for (const path of dataLayers("site-notes.md", root)) {
        for (const s of sections(readFileSync(path, "utf8"), site)) {
          console.log(`${rel(path, root)}:\n${s}\n`);
          found++;
        }
      }
      if (!found) console.log(`no notes on ${site} yet`);
      return 0;
    }
    const path = join(customDir(root), "site-notes.md");
    let text = existsSync(path) ? readFileSync(path, "utf8") : HEADER;
    const line = `- ${today()}: ${words.join(" ").trim()}`;
    const parts = text.split(/^(?=## )/m);
    const i = parts.findIndex((s) => s.startsWith("## ") && s.split("\n")[0].toLowerCase().includes(site.trim().toLowerCase()));
    if (i >= 0) parts[i] = `${parts[i].trimEnd()}\n${line}\n\n`;
    else parts.push(`${parts[parts.length - 1].endsWith("\n\n") ? "" : "\n"}## ${site}\n${line}\n`);
    text = parts.join("").replace(/\n{3,}/g, "\n\n");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
    console.log(`added to ${rel(path, root)} under ${i >= 0 ? parts[i].split("\n")[0] : `## ${site}`}`);
    return 0;
  },
};
export default command;
