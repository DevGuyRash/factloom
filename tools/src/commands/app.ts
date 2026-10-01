import { flag, parseArgs } from "../lib/args.ts";
import { createApplication, findDuplicate, listApplications, loadRecord, type Application } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { isBlocked } from "../lib/employers.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { loadPipelineConfig } from "../lib/pipeline-config.ts";
import { loadQueue, saveQueue } from "../lib/queue.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { normalizeUrl } from "../lib/text.ts";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

function findApp(person: string, dirArg: string): Application {
  const app = listApplications(person).find((a) => a.dir === dirArg || a.name === dirArg || rel(a.dir) === dirArg);
  if (!app) throw new Error(`no application matches ${dirArg}`);
  return app;
}

/** `app new` creates an application (refusing duplicates and blocked employers); `submit`, `hold`, and `skip` update its record. */
const command: Command = {
  name: "app",
  summary: "Create, submit, hold, or skip a job application",
  usage: [
    "resumes app new --company <name> --role <title> [--url U] [--source S] [--site Z] [--requisition R] [--person p]",
    "resumes app submit <dir> [--confirmation TEXT] [--person p]",
    "resumes app hold <dir> --reason TEXT [--person p]",
    "resumes app skip <dir> --reason TEXT [--person p]",
  ].join("\n       "),
  run(argv) {
    const [sub, ...rest] = argv;
    const a = parseArgs(rest);
    const person = resolvePerson(flag(a, "person"));

    if (sub === "new") {
      const company = flag(a, "company");
      const role = flag(a, "role");
      if (!company || !role) throw new Error("app new needs --company and --role");
      if (isBlocked(person, company)) {
        console.error(`${company} is blocked; see employers.md`);
        return 1;
      }
      const dup = findDuplicate(person, { company, role, url: flag(a, "url"), requisition: flag(a, "requisition") });
      if (dup) {
        console.error(`duplicate of ${rel(dup.dir)}`);
        return 1;
      }
      const app = createApplication(person, {
        company, role, url: flag(a, "url"), source: flag(a, "source"), site: flag(a, "site"), requisition: flag(a, "requisition"),
      });
      console.log(rel(app.dir));
      return 0;
    }

    if (sub === "submit") {
      const dirArg = a._[0];
      if (!dirArg) throw new Error("app submit needs <dir>");
      const app = findApp(person, dirArg);
      const { data, body } = loadRecord(app);
      const applied = today();
      const cfg = loadPipelineConfig();
      data.status = "submitted";
      data.applied = applied;
      data.follow_up = addDays(applied, cfg.follow_up_days);
      data.updated = applied;
      const confirmation = flag(a, "confirmation");
      if (confirmation) data.confirmation = confirmation;
      writeDoc(app.recordPath!, data, body);
      if (data.url) {
        const { items } = loadQueue(person);
        const key = normalizeUrl(String(data.url));
        const i = items.findIndex((q) => normalizeUrl(q.url) === key);
        if (i >= 0) {
          items[i] = { ...items[i], status: "done", outcome: "submitted", application: rel(app.dir) };
          saveQueue(person, items);
        }
      }
      console.log(`submitted ${rel(app.dir)} (follow up ${data.follow_up})`);
      return 0;
    }

    if (sub === "hold") {
      const dirArg = a._[0];
      const reason = flag(a, "reason");
      if (!dirArg || !reason) throw new Error("app hold needs <dir> --reason TEXT");
      const app = findApp(person, dirArg);
      const { data, body } = loadRecord(app);
      data.status = "blocked";
      data.updated = today();
      writeDoc(app.recordPath!, data, `${body.trimEnd()}\n\n- ${today()}: held — ${reason}\n`);
      console.log(`held ${rel(app.dir)}: ${reason}`);
      return 0;
    }

    if (sub === "skip") {
      const dirArg = a._[0];
      const reason = flag(a, "reason");
      if (!dirArg || !reason) throw new Error("app skip needs <dir> --reason TEXT");
      const app = findApp(person, dirArg);
      const { data, body } = loadRecord(app);
      data.status = "skipped";
      data.updated = today();
      writeDoc(app.recordPath!, data, `${body.trimEnd()}\n\n- ${today()}: skipped — ${reason}\n`);
      if (data.url) {
        const { items } = loadQueue(person);
        const key = normalizeUrl(String(data.url));
        const i = items.findIndex((q) => normalizeUrl(q.url) === key);
        if (i >= 0) {
          items[i] = { ...items[i], status: "done", outcome: "skipped", note: reason, application: rel(app.dir) };
          saveQueue(person, items);
        }
      }
      console.log(`skipped ${rel(app.dir)}: ${reason}`);
      return 0;
    }

    console.error(`unknown app subcommand ${sub ?? ""}`.trim());
    return 2;
  },
};
export default command;
