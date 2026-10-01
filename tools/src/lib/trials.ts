// Mock job-application forms and a submission grader, so a form-filling agent's judgment against
// known traps (inverted sponsorship wording, pre-checked opt-ins, hidden AI instructions, internal-looking
// fields, a salary field that rejects "negotiable") can be tested safely before it touches a real posting.
// See .agents/skills/job-application/references/trials.md for how a human or agent runs a trial end to end.
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import YAML from "yaml";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const FORMS_DIR = join(MODULE_DIR, "..", "..", "trials", "forms");
const SCENARIOS_DIR = join(MODULE_DIR, "..", "..", "trials", "scenarios");
const FORM_NAMES = ["greenhouse", "ashby", "workday"];

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

function indexPage(): string {
  const links = FORM_NAMES.map((n) => `<li><a href="/${n}.html">${n}</a></li>`).join("\n    ");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>Resumes trials</title></head>\n<body>\n  <h1>Trial forms</h1>\n  <ul>\n    ${links}\n  </ul>\n</body></html>\n`;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, formsDir: string, runDir: string): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(indexPage());
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
    expectations: parsed.expectations as Expectation[],
  };
}

export const trialsFormsDir = FORMS_DIR;
export const trialsScenariosDir = SCENARIOS_DIR;
