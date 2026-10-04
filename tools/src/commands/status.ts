import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { listPeople, rel, repoRoot, resolvePerson } from "../lib/repo.ts";
import { closures, loadSearchesDoc, passStatus } from "../lib/searches.ts";
import { pendingSnapshot } from "../lib/stats.ts";

/**
 * One-screen "what's pending": submits clicked but not recorded (first, since resending is the worst mistake), held
 * applications grouped by kind, sent ones with a step pending, unreadable records, the queue, follow-ups, the inbox,
 * guides needing review or research, and the searches: due, the current pass, closed sites, and paused searches.
 */
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
    for (const c of s.submitClicked) {
      console.log(`SUBMIT CLICKED, NOT RECORDED: ${rel(c.dir, root)} (${c.company} — ${c.role}) at ${c.at}: check the site or mail for a confirmation and record it with app submit; never send it again`);
    }
    for (const u of s.unreadable) console.log(`unreadable record: ${rel(u.dir, root)}: ${u.error}`);
    console.log(`held: ${s.held.length}`);
    const kinds = [...new Set(s.held.map((h) => h.kind ?? "unsorted"))];
    for (const kind of kinds) {
      const group = s.held.filter((h) => (h.kind ?? "unsorted") === kind);
      if (kinds.length > 1 || kind !== "unsorted") console.log(`  ${kind} (${group.length}):`);
      for (const h of group) console.log(`  - ${rel(h.dir, root)} (${h.company} — ${h.role}): ${h.reason || "no reason recorded"}${h.waitsOn ? ` [waits on ${h.waitsOn}]` : ""}`);
    }
    if (s.pendingSteps.length) console.log(`sent, with a step pending: ${s.pendingSteps.length}`);
    for (const p of s.pendingSteps) console.log(`  - ${rel(p.dir, root)} (${p.company} — ${p.role}): ${p.pending}`);
    console.log(`queue: ${s.queueOpen} open, ${s.queueStale} stale`);
    console.log(`follow-ups due: ${s.followupsDue.length}`);
    for (const f of s.followupsDue) console.log(`  - ${rel(f.dir, root)} (${f.company} — ${f.role}) due ${f.followUp}`);
    console.log(`inbox entries: ${s.inboxCount}`);
    console.log(`guides needing review: ${s.guidesNeedingReview.length}`);
    for (const g of s.guidesNeedingReview) console.log(`  - ${rel(g.path, root)}`);
    console.log(`guides needing research: ${s.guidesNeedingResearch.length}`);
    for (const g of s.guidesNeedingResearch) console.log(`  - ${rel(g.path, root)} (${g.researched ? `researched ${g.researched}` : "never researched"})`);
    console.log(`searches due: ${s.searchesDue}`);
    const doc = loadSearchesDoc(person, root).data;
    if (doc.items.length) {
      const p = passStatus(doc);
      const { closed, paused } = closures(doc);
      console.log(p.started ? `search pass since ${p.started}: ${p.ran} of ${p.open} open searches run, ${p.new} new` : `search passes: ${doc.last_pass ? `last ended ${doc.last_pass.ended} with ${doc.last_pass.new} new` : "none yet"}`);
      for (const c of closed) console.log(`  closed: ${c.site} until ${c.until}${c.reason ? ` (${c.reason})` : ""}`);
      for (const x of paused) console.log(`  paused: ${x.id} until ${x.paused_until}${x.paused_reason ? ` (${x.paused_reason})` : ""}`);
    }
    if (s.intake.dropWaiting || s.intake.pending.length || s.intake.noExperienceYet) {
      console.log(`resume intake: ${s.intake.dropWaiting} file(s) waiting in drop/, ${s.intake.pending.length} imported resume(s) not yet merged${s.intake.noExperienceYet ? "; facts.yaml has no jobs or projects yet" : ""} (the job-application skill's intake reference)`);
      for (const n of s.intake.pending) console.log(`  - ${n.status.padEnd(13)} ${rel(n.path, root)}`);
    }
    return 0;
  },
};
export default command;
