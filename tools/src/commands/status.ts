import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { listPeople, rel, repoRoot, resolvePerson } from "../lib/repo.ts";
import { pendingSnapshot } from "../lib/stats.ts";

/** One-screen "what's pending": held apps + reasons, queue counts, follow-ups due, inbox size, guides needing review or research, searches due. */
const command: Command = {
  name: "status",
  summary: "One-screen summary of what's pending",
  usage: "resumes status [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    let person: string;
    try {
      person = resolvePerson(flag(a, "person"));
    } catch (e) {
      // During setup the only person still has applying disabled; status still covers them.
      const people = listPeople();
      if (flag(a, "person") || people.length !== 1) throw e;
      person = people[0];
    }
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
    if (s.intake.dropWaiting || s.intake.pending.length || s.intake.noJobsYet) {
      console.log(`resume intake: ${s.intake.dropWaiting} file(s) waiting in drop/, ${s.intake.pending.length} imported resume(s) not yet merged${s.intake.noJobsYet ? "; facts.yaml has no jobs yet" : ""} (the job-application skill's intake reference)`);
      for (const n of s.intake.pending) console.log(`  - ${n.status.padEnd(13)} ${rel(n.path, root)}`);
    }
    return 0;
  },
};
export default command;
