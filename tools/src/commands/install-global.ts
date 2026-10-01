import { has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { applyLinks, planLinks } from "../lib/install.ts";
import { repoRoot } from "../lib/repo.ts";

/** `install-global [--apply] [--remove]`: links ~/.agents and ~/.claude skills to this repo's skill dir. Dry run by default. */
const command: Command = {
  name: "install-global",
  summary: "Plan or create the ~/.agents and ~/.claude symlinks to this repo's job-application skill",
  usage: "resumes install-global [--apply] [--remove]",
  run(argv) {
    const a = parseArgs(argv, ["apply", "remove"]);
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (!home) { console.error("no HOME (or USERPROFILE) in the environment"); return 1; }
    const root = repoRoot();
    const apply = has(a, "apply");
    const remove = has(a, "remove");
    const plans = planLinks(root, home, remove);

    if (!apply) {
      for (const p of plans) console.log(`[plan] ${p.link} -> ${p.action} (${p.detail})`);
      console.log("dry run; pass --apply to create" + (remove ? " (with --remove, to remove)" : ""));
      return 0;
    }
    const results = applyLinks(plans);
    let blocked = 0;
    for (const r of results) {
      console.log(`${r.applied ? "[done]" : "[skip]"} ${r.link}: ${r.detail}`);
      if (r.action === "blocked") blocked++;
    }
    return blocked > 0 ? 1 : 0;
  },
};
export default command;
