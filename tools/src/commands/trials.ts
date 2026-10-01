// `resumes trials prepare` copies the demo repository, ready to apply from, for a trial; `resumes trials serve` runs the mock job-application forms under tools/trials/forms; `resumes trials grade`
// checks a whole run directory (every scenario) or one saved submission against a tools/trials/scenarios/<name>.yaml scenario. Thin CLI wrapper
// around tools/src/lib/trials.ts, which holds the server and grading logic.
import { readFileSync, statSync } from "node:fs";
import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { resolve } from "node:path";
import { gradeRun, gradeSubmission, loadScenario, prepareTrialCopy, startTrialsServer } from "../lib/trials.ts";

const USAGE = "resumes trials prepare <dir> | resumes trials serve [--port 4380] [--dir <run-dir>] | resumes trials grade <run-dir> | resumes trials grade <submission.json> --scenario <name>";

function usageError(): number {
  console.error(`usage: ${USAGE}`);
  return 2;
}

async function serve(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  const portFlag = flag(a, "port");
  const port = portFlag !== undefined ? Number(portFlag) : 4380;
  const dir = flag(a, "dir");
  const handle = await startTrialsServer({ port, runDir: dir });
  console.log(`open http://localhost:${handle.port}/ to pick a form`);
  // Keep the process (and the listening server) alive until the user kills it.
  return new Promise<number>(() => {});
}

function grade(argv: string[]): number {
  const a = parseArgs(argv);
  const submissionPath = a._[0];
  const scenarioName = flag(a, "scenario");
  if (submissionPath && !scenarioName && statSync(submissionPath, { throwIfNoEntry: false })?.isDirectory()) {
    const grades = gradeRun(submissionPath);
    for (const g of grades) {
      console.log(`${g.ok ? "PASS" : "FAIL"} ${g.scenario}: ${g.summary}`);
      for (const item of g.result?.items.filter((i) => !i.pass) ?? []) console.log(`       ${item.field} (${item.expect}) — ${item.detail}`);
    }
    console.log(`${grades.filter((g) => g.ok).length}/${grades.length} postings handled correctly`);
    return grades.every((g) => g.ok) ? 0 : 1;
  }
  if (!submissionPath || !scenarioName) return usageError();
  const submission = JSON.parse(readFileSync(submissionPath, "utf8")) as Record<string, unknown>;
  const scenario = loadScenario(scenarioName);
  if (scenario.submission === "none") {
    console.log(`FAIL ${scenario.scenario}: submitted a posting that should have been skipped`);
    return 1;
  }
  const result = gradeSubmission(submission, scenario);
  for (const item of result.items) {
    console.log(`${item.pass ? "PASS" : "FAIL"} ${item.field} (${item.expect})${item.detail ? " — " + item.detail : ""}`);
  }
  console.log(`${result.passed}/${result.total} passed`);
  return result.ok ? 0 : 1;
}

const command: Command = {
  name: "trials",
  summary: "Serve mock job-application forms and grade saved submissions against a scenario",
  usage: USAGE,
  run(argv) {
    const [sub, ...rest] = argv;
    if (sub === "prepare") {
      if (!rest[0]) return usageError();
      const dest = resolve(rest[0]);
      const people = prepareTrialCopy(dest);
      console.log(`prepared ${dest} for ${people.join(", ")}: claims confirmed, resumes approved, applying enabled`);
      console.log(`run every command of the trial as RESUMES_ROOT=${dest} ./resumes …`);
      return 0;
    }
    if (sub === "serve") return serve(rest);
    if (sub === "grade") return grade(rest);
    return usageError();
  },
};
export default command;
