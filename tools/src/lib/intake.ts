// Getting a person's existing resumes into the repository: the mechanical half of intake. It finds
// files (the drop/ folder or given paths), turns the formats a converter can read into text, skips
// files already imported (by content), keeps every original in the person's archive, and holds
// lines with personal details out of git. Reading what no converter can (scans, photos, archives,
// unusual formats), reconciling versions, and writing facts.yaml are the agent's work: the
// job-application skill's intake reference.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, sep } from "node:path";
import YAML from "yaml";
import { peek, writeDoc } from "./frontmatter.ts";
import { extractDocumentText, isAllowed, loadAllowlist, scanLine } from "./pii.ts";
import { listPeople, personDir, rel, repoRoot, today, walkMarkdown } from "./repo.ts";
import { slugify } from "./text.ts";
import { sofficeCandidates } from "../render/pdf.ts";

/** The folder at the repository root where resumes are dropped before importing them (git ignores it). */
export const DROP_DIR = "drop";
export const dropDir = (root = repoRoot()) => join(root, DROP_DIR);

/** Where an imported resume stands: text ready, waiting for the agent to read, transcribed by the agent, or settled (written into facts.yaml, or set aside with a reason). */
export type IntakeStatus = "extracted" | "needs-reading" | "read" | "merged";
export const INTAKE_STATUSES: IntakeStatus[] = ["extracted", "needs-reading", "read", "merged"];

const TEXT_EXTS = [".txt", ".md", ".markdown", ".json", ".csv", ".yaml", ".yml", ".tex"];
const HTML_EXTS = [".html", ".htm", ".xhtml"];
const DIRECT_EXTS = [".docx", ".pdf"];
/** Word-processor formats LibreOffice converts to text. */
const CONVERT_EXTS = [".doc", ".docm", ".dot", ".dotx", ".rtf", ".odt", ".fodt", ".ott", ".wpd", ".wps", ".pages", ".abw", ".lwp", ".sxw"];
/** Folders that are really one document (macOS bundles): reported instead of imported. */
const BUNDLE_EXTS = [".pages", ".rtfd", ".numbers", ".key"];

/** OS, editor, and Office leftovers that are never resumes (the names .gitignore lists). */
export function isArtifact(name: string): boolean {
  return name.startsWith(".") || name.startsWith("~$") || /\.tmp$/i.test(name)
    || ["thumbs.db", "desktop.ini", "icon\r"].includes(name.toLowerCase());
}

export type Skipped = { path: string; reason: string };

function isLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Files to import from the given paths: folders expanded in a stable order, leftovers and the drop
 * folder's README skipped, linked folders not entered (a link may point anywhere), and anything
 * unreadable reported instead of thrown.
 */
export function scanIntake(paths: string[], root = repoRoot(), opts: { exclude?: string[] } = {}): { files: string[]; skipped: Skipped[] } {
  const files: string[] = [];
  const skipped: Skipped[] = [];
  const readme = join(dropDir(root), "README.md");
  const exclude = new Set(opts.exclude ?? []);
  const visit = (p: string, top: boolean) => {
    if (!top && (isArtifact(basename(p)) || exclude.has(p))) return;
    let st;
    try {
      st = lstatSync(p);
    } catch (e) {
      skipped.push({ path: p, reason: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (st.isSymbolicLink()) {
      let target;
      try {
        target = lstatSync(realpathSync(p));
      } catch {
        skipped.push({ path: p, reason: "a link to nothing" });
        return;
      }
      if (target.isFile()) files.push(p);
      else skipped.push({ path: p, reason: "a link to a folder: import that folder by its own path" });
      return;
    }
    if (st.isDirectory()) {
      if (!top && BUNDLE_EXTS.includes(extname(p).toLowerCase())) {
        skipped.push({ path: p, reason: "a document bundle: export it as PDF or Word" });
        return;
      }
      let names: string[];
      try {
        names = readdirSync(p).sort();
      } catch (e) {
        skipped.push({ path: p, reason: e instanceof Error ? e.message : String(e) });
        return;
      }
      for (const n of names) visit(join(p, n), false);
    } else if (st.isFile() && p !== readme) {
      files.push(p);
    }
  };
  for (const p of paths) {
    if (!existsSync(p) && !isLink(p)) skipped.push({ path: p, reason: "not found" });
    else visit(p, true);
  }
  return { files, skipped };
}

/**
 * The part of drop/ that belongs to `person`: drop/<person>/ when it exists, plus the loose files at
 * the top of drop/ (never another person's folder). With several people in one repository, a
 * folder per person keeps their files apart.
 */
export function dropSources(person: string | null, root = repoRoot()): { files: string[]; skipped: Skipped[] } {
  const dir = dropDir(root);
  if (!existsSync(dir)) return { files: [], skipped: [] };
  const others = listPeople(root).filter((p) => p !== person).map((p) => join(dir, p));
  return scanIntake([dir], root, { exclude: person ? others : [] });
}

/** Files waiting in drop/ for `person` (or for anyone, when null); never throws. */
export function dropWaiting(person: string | null = null, root = repoRoot()): string[] {
  try {
    return dropSources(person, root).files;
  } catch {
    return [];
  }
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

/** Plain text from HTML: scripts and styles dropped, block ends as line breaks, table cells apart, list items as dashes. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(td|th|dt|dd)>/gi, " \t ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|ul|ol|table|blockquote|dl)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return tidy(decodeEntities(text));
}

/** Trims each line, collapses runs of spaces and of blank lines. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text from bytes by their byte-order mark (UTF-8, or UTF-16 as Windows "Unicode" text is), or null when it is not text. */
export function decodeText(buf: Buffer): string | null {
  let text: string;
  if (buf[0] === 0xff && buf[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buf.subarray(2));
  else if (buf[0] === 0xfe && buf[1] === 0xff) text = new TextDecoder("utf-16be").decode(buf.subarray(2));
  else text = new TextDecoder("utf-8").decode(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf);
  const bad = (text.match(/[\u0000�]/g) ?? []).length;
  return bad > Math.max(2, text.length / 100) ? null : text;
}

/** Text through LibreOffice, or null when no working LibreOffice exists or it cannot read the file. */
function convertWithLibreOffice(file: string): string | null {
  const out = mkdtempSync(join(tmpdir(), "factloom-intake-"));
  try {
    for (const bin of sofficeCandidates()) {
      if (bin.startsWith("/") && !existsSync(bin)) continue;
      const r = spawnSync(bin, ["--headless", "--convert-to", "txt:Text (encoded):UTF8", "--outdir", out, file], { stdio: "ignore", timeout: 120_000 });
      const txt = readdirSync(out).find((n) => n.toLowerCase().endsWith(".txt"));
      if (r.status === 0 && txt) return decodeText(readFileSync(join(out, txt)));
    }
    return null;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** The file's text and how it was read, or null when only a reader (the agent) can get it. */
export async function readText(file: string): Promise<{ text: string; method: string } | null> {
  const ext = extname(file).toLowerCase();
  let text: string | null = null;
  let method = "";
  if (TEXT_EXTS.includes(ext)) [text, method] = [decodeText(readFileSync(file)), "text"];
  else if (HTML_EXTS.includes(ext)) {
    const raw = decodeText(readFileSync(file));
    [text, method] = [raw === null ? null : htmlToText(raw), "html"];
  } else if (DIRECT_EXTS.includes(ext)) [text, method] = [await extractDocumentText(file), ext.slice(1)];
  else if (CONVERT_EXTS.includes(ext)) [text, method] = [convertWithLibreOffice(file), "libreoffice"];
  if (!text) return null;
  // LaTeX ties and control spaces are spaces; left in, they hide words from the personal-detail scan.
  if (ext === ".tex") text = text.replace(/(?<!\\)~|\\ /g, " ");
  const cleaned = tidy(text);
  // A scanned PDF often yields only page-break characters or a few stray marks; letters in any script count.
  return (cleaned.match(/\p{L}/gu) ?? []).length >= 20 ? { text: cleaned, method } : null;
}

/** CSV columns that hold personal details or other people's contact details: every row under such a header is held. */
const SENSITIVE_COLUMN = /\b(birth|dob|address|street|zip|postal|e-?mail|phone|mobile|ssn|social security|passport|license)\b/i;

/** Lines holding personal details the pre-commit scan refuses (street addresses, ID and card numbers, keys), split from the rest. */
export function splitPersonalLines(text: string, relPath: string, root = repoRoot(), opts: { csv?: boolean } = {}): { kept: string; held: string[]; kinds: string[] } {
  const allow = loadAllowlist(root);
  const held: string[] = [];
  const kinds = new Set<string>();
  const lines = text.split("\n");
  const csvSensitive = Boolean(opts.csv) && lines.length > 1 && SENSITIVE_COLUMN.test(lines[0]);
  const kept = lines.map((line, i) => {
    const hits = scanLine(line).filter((h) => !isAllowed(relPath, h.match, allow)).map((h) => h.kind);
    if (csvSensitive && i > 0 && line.trim()) hits.push("personal column");
    if (!hits.length) return line;
    held.push(line);
    for (const k of hits) kinds.add(k);
    return `[line kept out of git: ${[...new Set(hits)].join(", ")}]`;
  });
  return { kept: kept.join("\n"), held, kinds: [...kinds] };
}

export const importedDir = (person: string, root = repoRoot()) => join(personDir(person, root), "resumes", "source", "imported");
const archiveDir = (person: string, root = repoRoot()) => join(personDir(person, root), "resumes", "archive");

export type ImportedNote = { path: string; status: IntakeStatus; sha256?: string; source?: string; name?: string };

/** The person's imported-resume notes (frontmatter `imported` set). A note from the earlier importer, without a status, counts as merged. */
export function importedNotes(person: string, root = repoRoot()): ImportedNote[] {
  return walkMarkdown(importedDir(person, root)).flatMap((path) => {
    const fm = peek(path);
    if (!fm || fm.type !== "notes" || !fm.imported) return [];
    const status: IntakeStatus = fm.status === undefined ? "merged" : INTAKE_STATUSES.includes(fm.status as IntakeStatus) ? (fm.status as IntakeStatus) : "extracted";
    return [{ path, status, sha256: typeof fm.sha256 === "string" ? fm.sha256 : undefined, source: typeof fm.source === "string" ? fm.source : undefined, name: typeof fm.original_name === "string" ? fm.original_name : undefined }];
  });
}

/** A path under `dir` named `<stem><suffix><ext>` that does not exist yet (adding -2, -3, ...). */
function freePath(dir: string, stem: string, ext: string, suffix = ""): string {
  for (let n = 1; ; n++) {
    const p = join(dir, `${stem}${n > 1 ? `-${n}` : ""}${suffix}${ext}`);
    if (!existsSync(p)) return p;
  }
}

/** The archive extension for an original: Markdown gets `.txt` added so `check` never reads it as a repository document; an extensionless file gets one so `*.local.*` matches. */
function archiveExt(ext: string): string {
  if ([".md", ".markdown"].includes(ext)) return `${ext}.txt`;
  return ext || ".bin";
}

export type ImportOutcome = {
  file: string;
  outcome: "imported" | "needs-reading" | "duplicate" | "restored";
  note?: string;
  original?: string;
  sidecar?: string;
  heldKinds?: string[];
  method?: string;
};

export type ImportOptions = { keep?: boolean };

/** Whether `file` was handed in through drop/. */
function inDrop(file: string, root: string): boolean {
  return file.startsWith(dropDir(root) + sep);
}

/** Puts `file` at `to`: a regular file in drop/ is moved; a link in drop/ has its target's bytes copied and the link removed; anything else is copied. */
function placeOriginal(file: string, to: string, root: string, keep: boolean): void {
  const fromDrop = inDrop(file, root) && !keep;
  if (!fromDrop || isLink(file)) {
    copyFileSync(file, to);
    if (fromDrop) unlinkSync(file);
    return;
  }
  try {
    renameSync(file, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    copyFileSync(file, to);
    unlinkSync(file);
  }
}

/**
 * Imports one file for `person`. A file whose bytes were imported before is not imported again: it
 * leaves drop/ when the archive still holds the same bytes, and restores the archived original when
 * it does not (a git-ignored original is absent on a fresh clone). Lines the pre-commit scan refuses
 * go to a git-ignored `.local.md` file beside the note, and that original, like any file whose text
 * could not be read and checked, is archived under a `.local` name git ignores. The note is written
 * before the original moves, so a failure part-way leaves the file where it was.
 */
export async function importFile(file: string, person: string, root = repoRoot(), opts: ImportOptions = {}): Promise<ImportOutcome> {
  const hash = sha256(file);
  const seen = importedNotes(person, root).find((n) => n.sha256 === hash
    || (!n.sha256 && n.source !== undefined && existsSync(join(root, n.source)) && sha256(join(root, n.source)) === hash));
  if (seen) {
    const archived = seen.source ? join(root, seen.source) : null;
    if (archived && !(existsSync(archived) && sha256(archived) === hash)) {
      mkdirSync(join(archived, ".."), { recursive: true });
      placeOriginal(file, archived, root, Boolean(opts.keep));
      return { file, outcome: "restored", note: seen.path, original: archived };
    }
    if (inDrop(file, root) && !opts.keep) unlinkSync(file);
    return { file, outcome: "duplicate", note: seen.path, original: archived ?? undefined };
  }

  const ext = extname(file).toLowerCase();
  const stem = `${today()}_${slugify(basename(file, extname(file))) || "resume"}`;
  const notesDir = importedDir(person, root);
  const archive = archiveDir(person, root);
  mkdirSync(notesDir, { recursive: true });
  mkdirSync(archive, { recursive: true });
  const notePath = freePath(notesDir, stem, ".md");
  const noteStem = basename(notePath, ".md");
  const noteRel = rel(notePath, root);

  const read = await readText(file);
  const split = read ? splitPersonalLines(read.text, noteRel, root, { csv: ext === ".csv" }) : null;
  // The file name can carry details too (an address, a birth date): checked like any line.
  const nameHeld = splitPersonalLines(basename(file), noteRel, root).held.length > 0;
  const shownName = nameHeld ? "[file name kept out of git]" : basename(file);
  // A file whose text could not be read cannot be checked for personal details, so its original stays out of git.
  const local = !read || Boolean(split?.held.length) || nameHeld;
  const original = freePath(archive, stem, archiveExt(ext), local ? ".local" : "");

  const created: string[] = [];
  try {
    let sidecar: string | undefined;
    const heldKinds = [...(split?.kinds ?? []), ...(nameHeld ? ["file name"] : [])];
    if (heldKinds.length) {
      sidecar = join(notesDir, `${noteStem}.local.md`);
      const held = [...(nameHeld ? [`file name: ${basename(file)}`] : []), ...(split?.held ?? [])];
      writeFileSync(sidecar, `---\n${YAML.stringify({ type: "notes", person, held_from: noteRel })}---\n\nLines held out of git from ${noteRel}; this file is git-ignored.\n\n${held.join("\n")}\n`);
      created.push(sidecar);
    }
    const data: Record<string, unknown> = {
      type: "notes",
      person,
      imported: today(),
      status: read ? "extracted" : "needs-reading",
      original_name: shownName,
      source: rel(original, root),
      format: ext.slice(1) || "none",
      sha256: hash,
      ...(read ? { method: read.method } : {}),
      ...(sidecar ? { held_lines: rel(sidecar, root) } : {}),
    };
    const why = read ? `some lines hold personal details (${heldKinds.join(", ")})` : "its contents could not be checked for personal details";
    const kept = local ? `\nThe original is archived as \`${rel(original, root)}\`, a \`.local\` file git ignores, because ${why}. It stays on this computer only.\n` : "";
    const body = read
      ? `
# Imported resume text

Text extracted from \`${shownName}\` (${read.method}). Original: \`${rel(original, root)}\`.${sidecar ? ` Lines with personal details are in \`${rel(sidecar, root)}\` (git-ignored); they stay out of resumes and git.` : ""}
${kept}
Next (the job-application skill's intake reference): check this text against the original, write
\`resumes/source/facts.yaml\` from it with every other imported version, then set \`status: merged\`.

\`\`\`text
${split!.kept}
\`\`\`
`
      : `
# Imported resume: needs reading

No text could be extracted from \`${shownName}\` (${ext || "no extension"}).
${kept}
Next (the job-application skill's intake reference): open \`${rel(original, root)}\` yourself, write
its text in the block below as faithfully as you can, mark anything unreadable as [illegible], and
set \`status: read\`. Lines with a street address, an ID number, or a birth date go in
\`${noteStem}.local.md\` beside this note instead.

\`\`\`text
\`\`\`
`;
    writeDoc(notePath, data, body);
    created.push(notePath);
    placeOriginal(file, original, root, Boolean(opts.keep));
    return { file, outcome: read ? "imported" : "needs-reading", note: notePath, original, sidecar, heldKinds: sidecar ? heldKinds : undefined, method: read?.method };
  } catch (e) {
    for (const p of created) rmSync(p, { force: true });
    throw e;
  }
}

/** The person to import for: the one named, or the only person in the repository. */
export function intakePerson(explicit: string | undefined, root = repoRoot()): string {
  if (explicit) {
    if (!existsSync(personDir(explicit, root))) throw new Error(`no person directory people/${explicit}; create it with ./resumes person new "<Full Name>"`);
    return explicit;
  }
  const people = listPeople(root);
  if (people.length === 1) return people[0];
  throw new Error(people.length ? `several people here (${people.join(", ")}); pass --person` : 'nobody is set up yet: run ./resumes person new "<Full Name>" first');
}

/** Whether the person's facts.yaml lists no job yet: a new person whose resumes still need to come in. */
export function factsWithoutJobs(person: string, root = repoRoot()): boolean {
  const path = join(personDir(person, root), "resumes", "source", "facts.yaml");
  if (!existsSync(path)) return true;
  try {
    const facts = YAML.parse(readFileSync(path, "utf8")) as { jobs?: Record<string, unknown> } | null;
    return !facts?.jobs || Object.keys(facts.jobs).length === 0;
  } catch {
    return false;
  }
}

/** Paths relative to the repository root when inside it, else as given. */
export function shown(path: string, root = repoRoot()): string {
  const r = relative(root, path);
  return r.startsWith("..") ? path : r;
}
