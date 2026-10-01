import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { flag, parseArgs } from "../lib/args.ts";
import { listApplications } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { personDir, rel, repoRoot, resolvePerson, today } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";
import { computeStats, pendingSnapshot, type GroupCounts } from "../lib/stats.ts";
import { renderTemplate } from "../lib/templates.ts";

function weekOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toLocaleDateString("en-CA");
}

function toRows(map: Record<string, GroupCounts>) {
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, ...v }));
}

/** Writes people/<person>/dashboard.md (via the dashboard template): status counts, applications/week, held reasons, follow-ups, queue, searches, guides, and stats — all computed from records. */
const command: Command = {
  name: "dashboard",
  summary: "Write people/<person>/dashboard.md from the current records",
  usage: "resumes dashboard [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const root = repoRoot();
    const snapshot = pendingSnapshot(person, root);
    const stats = computeStats(person, root);
    const cfg = loadPipelineConfig(root);

    const perWeekMap = new Map<string, number>();
    for (const app of listApplications(person, root)) {
      const d = typeof app.record?.applied === "string" ? app.record.applied : app.name.slice(0, 10);
      perWeekMap.set(weekOf(d), (perWeekMap.get(weekOf(d)) ?? 0) + 1);
    }
    const perWeek = [...perWeekMap.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([week, count]) => ({ week, count }));

    const context = {
      person,
      updated: today(),
      statusCounts: snapshot.statusCounts,
      perWeek,
      held: snapshot.held.map((h) => ({ ...h, dir: rel(h.dir, root) })),
      followupsDue: snapshot.followupsDue.map((f) => ({ ...f, dir: rel(f.dir, root) })),
      queueOpen: snapshot.queueOpen,
      queueStale: snapshot.queueStale,
      staleDays: cfg.stale_queue_days,
      searchesDue: snapshot.searchesDue,
      guidesNeedingReview: snapshot.guidesNeedingReview.map((g) => ({ path: rel(g.path, root) })),
      statsByVariant: toRows(stats.byVariant),
      statsByCoverLetter: toRows(stats.byCoverLetter),
      statsBySource: toRows(stats.bySource),
      statsBySite: toRows(stats.bySite),
    };

    const text = renderTemplate("dashboard", context, person, root);
    const out = join(personDir(person, root), FILE_NAMES.dashboard);
    writeFileSync(out, text);
    console.log(`wrote ${rel(out, root)}`);
    return 0;
  },
};
export default command;
