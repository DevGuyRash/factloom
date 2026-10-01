import { flag, parseArgs } from "../lib/args.ts";
import { listApplications } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";

/** Submitted applications whose follow_up date is due within `--days` (default 0: due today or overdue). */
const command: Command = {
  name: "followups",
  summary: "Submitted applications whose follow-up date is due",
  usage: "resumes followups [--days N] [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const days = Number(flag(a, "days") ?? "0");
    const horizon = new Date(`${today()}T00:00:00`);
    horizon.setDate(horizon.getDate() + days);
    const horizonStr = horizon.toLocaleDateString("en-CA");
    const due = listApplications(person).filter((app) => {
      const r = app.record;
      return r?.status === "submitted" && typeof r.follow_up === "string" && r.follow_up <= horizonStr;
    });
    if (!due.length) {
      console.log("no follow-ups due");
      return 0;
    }
    for (const app of due) console.log(`${rel(app.dir)} — follow up by ${app.record!.follow_up} (${app.record!.company} — ${app.record!.role})`);
    return 0;
  },
};
export default command;
