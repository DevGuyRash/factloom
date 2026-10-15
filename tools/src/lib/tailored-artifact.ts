// Exact tailored-artifact provenance and the narrow application submission write boundary.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import type { Variant } from "../render/spec.ts";
import { personDir, stamp } from "./repo.ts";
import { wasSent } from "./stats.ts";
import type { Record_ } from "./applications.ts";

export type ArtifactIdentity = { mode: "genuine_career" | "synthetic_research" | "unknown"; batch_id?: string };
type Source = { head: string | null; revision: string; facts: string; variant: string; controls: string | null };
type Build = { version: 1; person: string; application: string; identity: ArtifactIdentity; spec: { name: string; sha256: string }; files: { name: string; sha256: string }[]; source: Source | null; source_sha256: string | null; sendable: boolean };
type Association = { state: "pending" | "submitted" | "unknown"; snapshot: string | null; sha256?: string; restriction?: ArtifactIdentity; submitted_on?: string; reason?: string };
export type FrozenArtifact = { state: Association["state"]; identity: ArtifactIdentity; spec: Variant | null; source_revision: string | null; files: string[]; selected_file: string | null; reason?: string };
const BUILD = "tailored-artifact.json";
const SPEC = "resume-tailored.yaml";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Reject traversal and symlinks at every owned path component before reads or writes. */
export function safeArtifactPath(base: string, path: string): string {
  const rel = relative(resolve(base), resolve(path));
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(base) === resolve(path)) throw new Error("artifact path must remain inside its owner directory");
  let current = resolve(base);
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`artifact path contains a symlink: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return resolve(path);
}

export function validateOutput(output: unknown): asserts output is string {
  if (typeof output !== "string" || !output || output === "." || output === ".." || /[\\/:\x00-\x1f]/.test(output) || /[. ]$/.test(output)) {
    throw new Error("tailored output must be a safe filename basename, without path components");
  }
}

export function validateApplication(dir: string, person: string, root: string): void {
  if (dirname(resolve(dir)) !== resolve(personDir(person, root), "applications")) throw new Error("tailoring requires the person's own immediate application directory");
  safeArtifactPath(root, dir);
}

export function hasSubmissionHistory(record: Record<string, unknown>): boolean {
  return wasSent(record as Record_) || !!record.submit_clicked || record.submission_artifact !== undefined ||
    ["withdrawn", "possibly-submitted", "possibly_submitted"].includes(String(record.status)) ||
    (Array.isArray(record.events) && record.events.some((e) => object(e) && ["submitting", "submit-clicked", "possibly-submitted", "withdrawn"].includes(String(e.kind))));
}

/** Cooperating tailor and app commands cannot render while another freezes the same artifact. */
export function lockArtifact(dir: string): () => void {
  const path = safeArtifactPath(dir, join(dir, ".tailored-artifact.lock"));
  try { mkdirSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("another tailored-artifact operation owns this application; retry after its checkpoint");
    throw error;
  }
  return () => rmSync(path, { recursive: true });
}

export function tailoredDestination(dir: string, record: Record<string, unknown>, revision?: string, opts: { reuseDraft?: boolean } = {}): string {
  if (!revision) {
    if (hasSubmissionHistory(record)) throw new Error("sent or possible submission artifacts are preserved; use --revision <new-name> for a separate draft");
    return dir;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(revision)) throw new Error("revision must be a short alphanumeric name with hyphens or underscores");
  const out = safeArtifactPath(dir, join(dir, "revisions", revision));
  if (existsSync(out) && !opts.reuseDraft) throw new Error(`revision ${revision} already exists; choose a new revision name`);
  return out;
}

export function effectiveArtifactIdentity(person: string, root: string, ...sources: unknown[]): ArtifactIdentity & { mode: "genuine_career" | "synthetic_research" } {
  const path = join(personDir(person, root), "resumes/source/research-controls.yaml");
  const controls: unknown = existsSync(path) ? YAML.parse(readFileSync(path, "utf8")) : undefined;
  const all = [...sources, controls].filter(object);
  const modes = new Set<string>(), batches = new Set<string>();
  for (const source of all) {
    if (source.mode !== undefined) {
      if (source.mode !== "genuine_career" && source.mode !== "synthetic_research") throw new Error("artifact mode must be genuine_career or synthetic_research");
      modes.add(source.mode);
    }
    if (source.batch_id !== undefined) {
      if (typeof source.batch_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(source.batch_id)) throw new Error("artifact batch_id must be a short stable identifier");
      batches.add(source.batch_id);
    }
  }
  if (modes.size > 1 || batches.size > 1) throw new Error("conflicting artifact modes or batch identities; reconcile the source before building");
  const mode = modes.has("synthetic_research") ? "synthetic_research" : "genuine_career";
  const batch_id = [...batches][0];
  if (mode === "synthetic_research" && !batch_id) throw new Error("a synthetic artifact requires its recorded batch_id");
  return { mode, ...(batch_id ? { batch_id } : {}) };
}

/** Opaque distinct filenames retain research blinding; identity remains explicit in private metadata. */
export function artifactIdentitySuffix(id: ArtifactIdentity): string {
  return id.mode === "synthetic_research" ? `_artifact_${hash(id.batch_id ?? "unknown").slice(0, 12)}` : "";
}

export function captureBuildSource(root: string, person: string, facts: string, variant: string): Source {
  const controls = join(personDir(person, root), "resumes/source/research-controls.yaml");
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const controlsText = existsSync(controls) ? readFileSync(controls, "utf8") : null;
  const revision = `sha256:${hash(JSON.stringify({ facts, variant, controls: controlsText }))}`;
  return { revision, head: git.status === 0 && /^[a-f0-9]{40,64}$/.test(git.stdout.trim()) ? git.stdout.trim() : null, facts, variant, controls: controlsText };
}

export function writeBuildManifest(dir: string, out: string, person: string, identity: ArtifactIdentity, source: Source, files: string[], sendable: boolean): void {
  const spec = safeArtifactPath(dir, join(out, SPEC));
  const manifest: Build = { version: 1, person, application: basename(dir), identity,
    spec: { name: SPEC, sha256: hash(readFileSync(spec)) },
    files: files.map((p) => ({ name: basename(p), sha256: hash(readFileSync(safeArtifactPath(dir, p))) })), source, source_sha256: hash(JSON.stringify(source)), sendable };
  writeFileSync(safeArtifactPath(dir, join(out, BUILD)), JSON.stringify(manifest, null, 2) + "\n");
}

function identity(value: unknown): ArtifactIdentity {
  if (!object(value) || !["unknown", "genuine_career", "synthetic_research"].includes(String(value.mode)) || (value.batch_id !== undefined && typeof value.batch_id !== "string")) throw new Error("invalid stored artifact identity");
  return { mode: value.mode as ArtifactIdentity["mode"], ...(typeof value.batch_id === "string" ? { batch_id: value.batch_id } : {}) };
}

function requireResearchScope(record: Record<string, unknown>, id: ArtifactIdentity): void {
  if (id.mode !== "synthetic_research") return;
  const scope = record.research_scope;
  if (!id.batch_id || record.research_batch !== id.batch_id || !object(scope) || scope.authorized !== true || scope.company_authorized !== true ||
    !Array.isArray(scope.companies) || !scope.companies.includes(record.company) || typeof record.url !== "string" ||
    !Array.isArray(scope.routes) || !scope.routes.includes(record.url) || !Array.isArray(scope.actions) || !scope.actions.includes("submit") ||
    typeof scope.stopping_condition !== "string" || !scope.stopping_condition.trim()) {
    throw new Error("synthetic artifact requires the matching research_batch and explicitly authorized bounded company, route, submit action and stopping condition");
  }
}

function readBuild(dir: string, record: Record<string, unknown>): Build | null {
  const path = safeArtifactPath(dir, join(dir, BUILD));
  if (!existsSync(path)) return null;
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!object(value) || value.version !== 1 || value.person !== record.person || value.application !== basename(dir) || !object(value.spec) || value.spec.name !== SPEC || typeof value.spec.sha256 !== "string" || !Array.isArray(value.files) || !value.files.length) throw new Error("stored artifact manifest does not match this application owner");
  const id = identity(value.identity);
  for (const file of [value.spec, ...value.files]) {
    if (!object(file) || typeof file.name !== "string" || typeof file.sha256 !== "string") throw new Error("invalid artifact file manifest");
    validateOutput(file.name);
    const path = safeArtifactPath(dir, join(dir, file.name));
    if (hash(readFileSync(path)) !== file.sha256) throw new Error(`artifact changed since it was built: ${file.name}; rebuild and review before the submit click`);
  }
  if (typeof value.sendable !== "boolean") throw new Error("invalid artifact preview/sendability metadata");
  if (value.source !== null && value.source_sha256 !== hash(JSON.stringify(value.source))) throw new Error("captured source integrity mismatch");
  if (value.source !== null && (!object(value.source) || typeof value.source.facts !== "string" || typeof value.source.variant !== "string")) throw new Error("invalid captured artifact source");
  return { ...value, identity: id } as unknown as Build;
}

/** Current markers constrain legacy reuse without establishing its historical factual provenance. */
function legacyRestrictionIdentity(dir: string, record: Record<string, unknown>, spec: unknown): ArtifactIdentity {
  const person = String(record.person);
  const root = resolve(dir, "../../../..");
  const factsPath = join(personDir(person, root), "resumes/source/facts.yaml");
  const facts: unknown = existsSync(factsPath) ? YAML.parse(readFileSync(factsPath, "utf8")) : undefined;
  const id = effectiveArtifactIdentity(person, root, spec, facts);
  return id.mode === "synthetic_research" ? id : { mode: "unknown" };
}

function unknownAssociation(reason: string, restriction: ArtifactIdentity): Association {
  return { state: "unknown", snapshot: null, reason, ...(restriction.mode === "synthetic_research" ? { restriction } : {}) };
}

function submissionRestriction(dir: string, record: Record<string, unknown>, fallback: ArtifactIdentity): ArtifactIdentity {
  const a = record.submission_artifact;
  if (object(a) && a.restriction !== undefined) return identity(a.restriction);
  return fallback.mode === "unknown" ? legacyRestrictionIdentity(dir, record, undefined) : fallback;
}

function requireSendable(build: Build | null, raw: unknown): void {
  if (build?.sendable === false || object(raw) && typeof raw.output === "string" && raw.output.endsWith("_PREVIEW_unconfirmed")) {
    throw new Error("unconfirmed preview artifacts are never sendable; resolve the claims, rebuild and review first");
  }
}

/** Called immediately before a real click; legacy artifacts retain unknown source/identity. */
export function freezeSubmissionArtifact(dir: string, record: Record<string, unknown>, selected?: string): Association {
  if (record.submission_artifact !== undefined) {
    const frozen = readSubmissionArtifact(dir, record);
    if (frozen.state !== "pending" && frozen.state !== "unknown") throw new Error("this application already has a submitted artifact association");
    requireResearchScope(record, submissionRestriction(dir, record, frozen.identity));
    if (selected) {
      const path = safeArtifactPath(dir, resolve(selected));
      if (dirname(path) !== resolve(dir) || !frozen.selected_file || basename(frozen.selected_file) !== basename(path) || hash(readFileSync(path)) !== hash(readFileSync(frozen.selected_file))) {
        throw new Error("the pending submit click has immutable or unknown upload selection; the selected artifact must match its exact owner, path and bytes");
      }
    }
    return record.submission_artifact as Association;
  }
  const specPath = safeArtifactPath(dir, join(dir, SPEC));
  if (!existsSync(specPath)) {
    const restriction = legacyRestrictionIdentity(dir, record, undefined);
    requireResearchScope(record, restriction);
    return unknownAssociation("no exact tailored artifact was recorded before this submit click", restriction);
  }
  const raw: unknown = YAML.parse(readFileSync(specPath, "utf8"));
  if (!object(raw) || raw.type !== "tailored-resume" || raw.person !== record.person) throw new Error("tailored spec does not match the application owner");
  validateOutput(raw.output);
  const build = readBuild(dir, record);
  requireSendable(build, raw);
  const id = build?.identity ?? legacyRestrictionIdentity(dir, record, raw);
  requireResearchScope(record, id);
  const files = build?.files ?? ["docx", "pdf"].map((ext) => ({ name: `${raw.output}.${ext}`, sha256: "" })).filter((f) => existsSync(join(dir, f.name))).map((f) => ({ ...f, sha256: hash(readFileSync(safeArtifactPath(dir, join(dir, f.name)))) }));
  if (!files.length) return unknownAssociation("no exact tailored document bytes were recorded before this submit click", id);
  let selected_file: string | null = null;
  if (selected !== undefined) {
    const path = safeArtifactPath(dir, resolve(selected));
    if (dirname(path) !== resolve(dir) || !files.some((f) => join(resolve(dir), f.name) === path)) throw new Error("selected artifact must be one of this application's exact built DOCX/PDF files");
    selected_file = basename(path);
  }
  const spec = { name: SPEC, sha256: hash(readFileSync(specPath)) };
  const key = hash(JSON.stringify({ spec, files, identity: id, selected_file })).slice(0, 24);
  const snapshot = `sent-artifacts/${key}/manifest.json`;
  const dest = safeArtifactPath(dir, join(dir, dirname(snapshot)));
  if (existsSync(dest)) throw new Error("a snapshot with these bytes already exists without its association; inspect it before recording another click");
  mkdirSync(join(dest, "files"), { recursive: true });
  let digest: string;
  try {
    copyFileSync(specPath, join(dest, SPEC));
    for (const file of files) copyFileSync(safeArtifactPath(dir, join(dir, file.name)), join(dest, "files", file.name));
    const manifest = JSON.stringify({ version: 1, person: record.person, application: basename(dir), captured_at: stamp(), identity: id, selected_file, spec, files, source: build?.source ?? null }, null, 2) + "\n";
    digest = hash(manifest);
    writeFileSync(join(dest, "manifest.json"), manifest, { flag: "wx" });
  } catch (error) { rmSync(dest, { recursive: true, force: true }); throw error; }
  return { state: "pending", snapshot, sha256: digest };
}

/** Reading historical evidence never resolves fact IDs against today's mutable facts. */
export function readSubmissionArtifact(dir: string, record: Record<string, unknown>): FrozenArtifact {
  const unknown = (reason: string): FrozenArtifact => ({ state: "unknown", identity: { mode: "unknown" },  spec: null, source_revision: null, files: [], selected_file: null, reason });
  const a = record.submission_artifact;
  if (a === undefined) return unknown("the historical submission has no exact artifact association");
  if (!object(a) || !["pending", "submitted", "unknown"].includes(String(a.state))) throw new Error("invalid submission artifact association");
  if (a.snapshot === null && a.state === "unknown") return unknown(typeof a.reason === "string" ? a.reason : "historical artifact bytes are unknown");
  if (typeof a.snapshot !== "string" || !/^sent-artifacts\/[a-f0-9]{24}\/manifest\.json$/.test(a.snapshot)) throw new Error("invalid submission artifact snapshot path");
  const path = safeArtifactPath(dir, join(dir, a.snapshot));
  const bytes = readFileSync(path);
  if (typeof a.sha256 !== "string" || a.sha256 !== hash(bytes)) throw new Error("historical artifact manifest/source integrity mismatch");
  const m: unknown = JSON.parse(bytes.toString("utf8"));
  if (!object(m) || m.version !== 1 || m.person !== record.person || m.application !== basename(dir) || !object(m.spec) || m.spec.name !== SPEC || !Array.isArray(m.files)) throw new Error("snapshot does not match the application owner");
  const dest = dirname(path); const files: string[] = [];
  if (hash(readFileSync(safeArtifactPath(dir, join(dest, SPEC)))) !== m.spec.sha256) throw new Error("historical tailored spec integrity mismatch");
  for (const f of m.files) {
    if (!object(f) || typeof f.name !== "string" || typeof f.sha256 !== "string") throw new Error("invalid historical artifact manifest");
    validateOutput(f.name);
    const file = safeArtifactPath(dir, join(dest, "files", f.name));
    if (hash(readFileSync(file)) !== f.sha256) throw new Error("historical tailored document integrity mismatch");
    files.push(file);
  }
  if (m.selected_file !== undefined && m.selected_file !== null && (typeof m.selected_file !== "string" || !m.files.some((f) => object(f) && f.name === m.selected_file))) throw new Error("invalid historical upload selection");
  const selected_file = typeof m.selected_file === "string" ? safeArtifactPath(dir, join(dest, "files", m.selected_file)) : null;
  const raw: unknown = YAML.parse(readFileSync(join(dest, SPEC), "utf8"));
  if (!object(raw) || raw.person !== record.person || raw.type !== "tailored-resume") throw new Error("historical tailored owner mismatch");
  const source = object(m.source) ? m.source : null;
  return { state: a.state as Association["state"], identity: identity(m.identity),
    spec: raw as unknown as Variant, source_revision: source && typeof source.revision === "string" ? source.revision : source && typeof source.head === "string" ? source.head : null, files, selected_file,
    ...(!source ? { reason: "exact document bytes are known but their original source revision is unknown" } : {}) };
}

export function associateSubmissionArtifact(dir: string, record: Record<string, unknown>, applied: string): Association {
  if (record.submission_artifact === undefined) {
    const build = readBuild(dir, record);
    const spec = safeArtifactPath(dir, join(dir, SPEC));
    const raw: unknown = existsSync(spec) ? YAML.parse(readFileSync(spec, "utf8")) : undefined;
    requireSendable(build, raw);
    requireResearchScope(record, build?.identity ?? legacyRestrictionIdentity(dir, record, raw));
    return { state: "unknown", snapshot: null, submitted_on: applied, reason: "no artifact was captured at the original submit click; current files cannot establish historical bytes" };
  }
  const frozen = readSubmissionArtifact(dir, record);
  requireResearchScope(record, submissionRestriction(dir, record, frozen.identity));
  return { ...(record.submission_artifact as Association), ...(frozen.state === "pending" ? { state: "submitted" as const } : {}), submitted_on: applied };
}
