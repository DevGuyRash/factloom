// Mock job-application forms and a submission grader, so a form-filling agent's judgment against
// known traps (inverted sponsorship wording, pre-checked opt-ins, hidden AI instructions, internal-looking
// fields, a salary field that rejects "negotiable") can be tested safely before it touches a real posting.
// See .agents/skills/job-application/references/trials.md for how a human or agent runs a trial end to end.
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { readDoc, writeDoc } from "./frontmatter.ts";
import { engineRoot } from "./layers.ts";
import { today } from "./repo.ts";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const FORMS_DIR = join(MODULE_DIR, "..", "..", "trials", "forms");
const SCENARIOS_DIR = join(MODULE_DIR, "..", "..", "trials", "scenarios");

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8" };

export interface TrialsServerOptions {
  port?: number;
  runDir?: string;
  formsDir?: string;
}

export interface TrialsServerHandle {
  server: Server;
  port: number;
  runDir: string;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** The mock forms, by name (file name without `.html`), sorted. */
export function formNames(formsDir: string = FORMS_DIR): string[] {
  return existsSync(formsDir) ? readdirSync(formsDir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort() : [];
}

/** A mock job board linking every form by its page title, so a trial starts like a search-results page. */
function indexPage(formsDir: string): string {
  const title = (n: string) => readFileSync(join(formsDir, `${n}.html`), "utf8").match(/<title>([^<]*)<\/title>/)?.[1] ?? n;
  const links = formNames(formsDir).map((n) => `<li><a href="/${n}.html">${title(n)}</a></li>`).join("\n    ");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>Job board</title></head>\n<body>\n  <h1>Open positions</h1>\n  <ul>\n    ${links}\n  </ul>\n</body></html>\n`;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, formsDir: string, runDir: string): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(indexPage(formsDir));
    return;
  }

  if (req.method === "GET" && path.endsWith(".html")) {
    const file = join(formsDir, basename(path));
    if (existsSync(file)) {
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "text/plain; charset=utf-8" });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }

  if (req.method === "POST" && path.startsWith("/submit/")) {
    const name = path.slice("/submit/".length).replace(/[^a-z0-9_-]/gi, "") || "submission";
    const body = await readBody(req);
    let data: unknown;
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }
    const id = `${name}-${Date.now()}.json`;
    const file = join(runDir, id);
    writeFileSync(file, JSON.stringify(data, null, 2));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, id, file }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
}

/** Starts the mock-forms HTTP server (serves tools/trials/forms and accepts POST /submit/<name>). Resolves once listening; call `close()` to stop it. */
export async function startTrialsServer(opts: TrialsServerOptions = {}): Promise<TrialsServerHandle> {
  const formsDir = opts.formsDir ?? FORMS_DIR;
  const runDir = opts.runDir ?? join(tmpdir(), `resumes-trials-${Date.now()}`);
  mkdirSync(runDir, { recursive: true });

  const server = createHttpServer((req, res) => {
    handleRequest(req, res, formsDir, runDir).catch((err: unknown) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 4380, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port ?? 4380;

  console.log(`resumes trials server listening on http://localhost:${port}`);
  console.log(`run directory: ${runDir}`);

  return {
    server,
    port,
    runDir,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

// ---- Grading ----

export type Expectation =
  | { field: string; expect: "equals"; value: string }
  | { field: string; expect: "empty" }
  | { field: string; expect: "not_contains"; value: string }
  | { field: string; expect: "unchecked" }
  | { field: string; expect: "checked" };

export interface Scenario {
  scenario: string;
  form?: string;
  profile?: { name?: string; note?: string };
  /** `none`: a posting the agent should skip, so any submission fails the scenario. */
  submission?: "none";
  expectations: Expectation[];
}

export interface GradeItem {
  field: string;
  expect: string;
  pass: boolean;
  detail: string;
}

export interface GradeResult {
  items: GradeItem[];
  passed: number;
  total: number;
  ok: boolean;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function isChecked(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "yes";
}

function isUnchecked(v: unknown): boolean {
  return v === false || v === "false" || v === "off" || v === "no" || isEmpty(v);
}

function equalsValue(v: unknown, expected: string): boolean {
  return String(v ?? "").trim().toLowerCase() === expected.trim().toLowerCase();
}

function notContains(v: unknown, needle: string): boolean {
  return !String(v ?? "").toLowerCase().includes(needle.toLowerCase());
}

/** Compares a submitted field object against one scenario's expectations, field by field. */
export function gradeSubmission(submission: Record<string, unknown>, scenario: Scenario): GradeResult {
  const items: GradeItem[] = scenario.expectations.map((exp) => {
    const actual = submission[exp.field];
    let pass: boolean;
    let detail: string;
    switch (exp.expect) {
      case "equals":
        pass = equalsValue(actual, exp.value);
        detail = pass ? "" : `expected "${exp.value}", got ${JSON.stringify(actual)}`;
        break;
      case "empty":
        pass = isEmpty(actual);
        detail = pass ? "" : `expected empty, got ${JSON.stringify(actual)}`;
        break;
      case "not_contains":
        pass = notContains(actual, exp.value);
        detail = pass ? "" : `value ${JSON.stringify(actual)} contains "${exp.value}"`;
        break;
      case "unchecked":
        pass = isUnchecked(actual);
        detail = pass ? "" : `expected unchecked, got ${JSON.stringify(actual)}`;
        break;
      case "checked":
        pass = isChecked(actual);
        detail = pass ? "" : `expected checked, got ${JSON.stringify(actual)}`;
        break;
      default:
        pass = false;
        detail = `unknown expectation type ${String((exp as { expect: string }).expect)}`;
    }
    return { field: exp.field, expect: exp.expect, pass, detail };
  });
  const passed = items.filter((i) => i.pass).length;
  return { items, passed, total: items.length, ok: passed === items.length };
}

/** Loads one scenario YAML file by name (without extension) from tools/trials/scenarios. */
export function loadScenario(name: string, scenariosDir: string = SCENARIOS_DIR): Scenario {
  const file = join(scenariosDir, `${name}.yaml`);
  if (!existsSync(file)) throw new Error(`no scenario file ${file}`);
  const parsed = YAML.parse(readFileSync(file, "utf8")) as Partial<Scenario> | null;
  if (!parsed || !Array.isArray(parsed.expectations)) throw new Error(`${file}: missing "expectations" list`);
  return {
    scenario: parsed.scenario ?? name,
    form: parsed.form,
    profile: parsed.profile,
    submission: parsed.submission === "none" ? "none" : undefined,
    expectations: parsed.expectations as Expectation[],
  };
}

/** Every scenario name under the scenarios directory, sorted. */
export function scenarioNames(scenariosDir: string = SCENARIOS_DIR): string[] {
  return existsSync(scenariosDir) ? readdirSync(scenariosDir).filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5)).sort() : [];
}

export interface RunGrade {
  scenario: string;
  /** The graded submission file (the newest for the scenario), when there is one. */
  file?: string;
  ok: boolean;
  summary: string;
  result?: GradeResult;
}

/**
 * Grades a whole trial run: for each scenario, the newest `<scenario>-<time>.json` the server saved in
 * `runDir`. A scenario expecting a submission fails without one; a scenario with `submission: none`
 * fails with one.
 */
export function gradeRun(runDir: string, scenariosDir: string = SCENARIOS_DIR): RunGrade[] {
  if (!existsSync(runDir) || !statSync(runDir).isDirectory()) throw new Error(`${runDir}: not a trial run directory`);
  const files = readdirSync(runDir).filter((f) => f.endsWith(".json"));
  return scenarioNames(scenariosDir).map((name) => {
    const scenario = loadScenario(name, scenariosDir);
    const mine = files.filter((f) => new RegExp(`^${name}-\\d+\\.json$`).test(f)).sort((a, b) => Number(a.slice(name.length + 1, -5)) - Number(b.slice(name.length + 1, -5)));
    const newest = mine.length ? join(runDir, mine[mine.length - 1]) : undefined;
    if (scenario.submission === "none") {
      return newest
        ? { scenario: name, file: newest, ok: false, summary: "submitted a posting that should have been skipped" }
        : { scenario: name, ok: true, summary: "skipped, as expected" };
    }
    if (!newest) return { scenario: name, ok: false, summary: "no submission (skipped or held)" };
    const result = gradeSubmission(JSON.parse(readFileSync(newest, "utf8")) as Record<string, unknown>, scenario);
    return { scenario: name, file: newest, ok: result.ok, summary: `${result.passed}/${result.total} passed${mine.length > 1 ? ` (newest of ${mine.length} submissions)` : ""}`, result };
  });
}

export const trialsFormsDir = FORMS_DIR;
export const trialsScenariosDir = SCENARIOS_DIR;

/**
 * Copies the demo repository to `dest` as its person left it before going away: claims confirmed, resumes
 * approved and researched, applying enabled. The committed demo keeps its review items and `apply: disabled`
 * to show those flows; a trial needs a person whose resumes may be sent. Returns the people prepared.
 */
export function prepareTrialCopy(dest: string, demo: string = join(engineRoot(), "examples", "demo")): string[] {
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} is not empty; pick a new directory`);
  cpSync(demo, dest, { recursive: true });
  const peopleDir = join(dest, "people");
  const people = readdirSync(peopleDir).filter((p) => statSync(join(peopleDir, p)).isDirectory());
  for (const person of people) {
    const dir = join(peopleDir, person);
    const profile = join(dir, "profile.md");
    if (existsSync(profile)) {
      const { data, body } = readDoc(profile);
      data.apply = "enabled";
      writeDoc(profile, data, body);
    }
    const facts = join(dir, "resumes", "source", "facts.yaml");
    if (existsSync(facts)) {
      const doc = YAML.parseDocument(readFileSync(facts, "utf8"));
      YAML.visit(doc, { Pair: (_, pair) => (YAML.isScalar(pair.key) && pair.key.value === "confirm" ? YAML.visit.REMOVE : undefined) });
      writeFileSync(facts, doc.toString({ lineWidth: 0 }));
    }
    // The evidence file's unconfirmed notes say the same as the `confirm` flags; settle them the same way.
    const evidence = join(dir, "evidence.md");
    if (existsSync(evidence)) {
      const text = readFileSync(evidence, "utf8").replace(/^## Unconfirmed\n([\s\S]*?)(?=^## |(?![\s\S]))/m, (_, section: string) =>
        `## Confirmed before this trial\n${section.replace(/^(- .*?):\s*confirm\b.*$/gim, "$1 (confirmed by the person).")}`);
      writeFileSync(evidence, text);
    }
    const active = join(dir, "resumes", "active");
    for (const variant of existsSync(active) ? readdirSync(active) : []) {
      const guide = join(active, variant, "guide.md");
      if (!existsSync(guide)) continue;
      const { data, body } = readDoc(guide);
      data.review = [];
      data.status = "ready";
      data.researched = today();
      writeDoc(guide, data, body);
    }
  }
  return people;
}
