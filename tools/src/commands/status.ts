import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { rel, repoRoot, resolvePerson } from "../lib/repo.ts";
import { pendingSnapshot } from "../lib/stats.ts";

/** One-screen "what's pending": held apps + reasons, queue counts, follow-ups due, inbox size, guides needing review or research, searches due. */
const command: Command = {
  name: "status",
  summary: "One-screen summary of what's pending",
  usage: "resumes status [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const root = repoRoot();
    const s = pendingSnapshot(person, root);
    console.log(`status for ${person}`);
    console.log(`held: ${s.held.length}`);
    for (const h of s.held) console.log(`  - ${rel(h.dir, root)} (${h.company} — ${h.role}): ${h.reason || "no reason recorded"}`);
    console.log(`queue: ${s.queueOpen} open, ${s.queueStale} stale`);
    console.log(`follow-ups due: ${s.followupsDue.length}`);
    for (const f of s.followupsDue) console.log(`  - ${rel(f.dir, root)} (${f.company} — ${f.role}) due ${f.followUp}`);
    console.log(`inbox entries: ${s.inboxCount}`);
    console.log(`guides needing review: ${s.guidesNeedingReview.length}`);
    for (const g of s.guidesNeedingReview) console.log(`  - ${rel(g.path, root)}`);
    console.log(`guides needing research: ${s.guidesNeedingResearch.length}`);
    for (const g of s.guidesNeedingResearch) console.log(`  - ${rel(g.path, root)} (${g.researched ? `researched ${g.researched}` : "never researched"})`);
    console.log(`searches due: ${s.searchesDue}`);
    return 0;
  },
};
export default command;
