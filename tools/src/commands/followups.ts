import { flag, parseArgs } from "../lib/args.ts";
import { listApplications } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { scamBlocked } from "../lib/scam.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";

/** Submitted applications whose follow_up date is due within `--days` (default 0: due today or overdue). */
const command: Command = {
  name: "followups",
  summary: "Submitted applications whose follow-up date is due",
  usage: "resumes followups [--days N] [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const rawDays = a.flags.days;
    const days = Number(rawDays ?? "0");
    if (rawDays === true || (typeof rawDays === "string" && !rawDays.trim()) || !Number.isFinite(days)) {
      throw new Error("--days takes a finite number of days");
    }
    const horizon = new Date(`${today()}T00:00:00`);
    horizon.setDate(horizon.getDate() + days);
    const year = horizon.getFullYear();
    if (!Number.isFinite(horizon.getTime()) || year < 0 || year > 9999) {
      throw new Error("--days must produce a follow-up horizon between 0000-01-01 and 9999-12-31");
    }
    // Record dates use four-digit years, so lexical ordering needs the same format.
    const horizonStr = `${String(year).padStart(4, "0")}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
    const due = listApplications(person).filter((app) => {
      const r = app.record;
      return r?.status === "submitted" && typeof r.follow_up === "string" && r.follow_up <= horizonStr;
    });
    const held = due.filter((app) => scamBlocked(app.record!));
    for (const app of held) console.log(`held for verification: ${rel(app.dir)} (${app.record!.company} — ${app.record!.role}); inspect risk show before any follow-up`);
    const eligible = due.filter((app) => !scamBlocked(app.record!));
    if (!eligible.length) {
      console.log(held.length ? "no cleared follow-ups due" : "no follow-ups due");
      return 0;
    }
    for (const app of eligible) console.log(`${rel(app.dir)} — follow up by ${app.record!.follow_up} (${app.record!.company} — ${app.record!.role})`);
    return 0;
  },
};
export default command;
