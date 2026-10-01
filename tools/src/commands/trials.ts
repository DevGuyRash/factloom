// `resumes trials serve` runs the mock job-application forms under tools/trials/forms; `resumes trials grade`
// checks a saved submission JSON file against a tools/trials/scenarios/<name>.yaml scenario. Thin CLI wrapper
// around tools/src/lib/trials.ts, which holds the server and grading logic.
import { readFileSync } from "node:fs";
import { flag, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { gradeSubmission, loadScenario, startTrialsServer } from "../lib/trials.ts";

const USAGE = "resumes trials serve [--port 4380] [--dir <run-dir>] | resumes trials grade <submission.json> --scenario <name>";

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
  if (!submissionPath || !scenarioName) return usageError();
  const submission = JSON.parse(readFileSync(submissionPath, "utf8")) as Record<string, unknown>;
  const scenario = loadScenario(scenarioName);
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
    if (sub === "serve") return serve(rest);
    if (sub === "grade") return grade(rest);
    return usageError();
  },
};
export default command;
