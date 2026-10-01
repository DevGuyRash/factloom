// Personal-data guard: detectors for secrets and PII-shaped values, plus the allowlist they
// respect. Also exports `extractDocumentText`, the shared docx/pdf-to-text pipeline — reused by
// the active-variants check (resume text must carry no draft markers) so there is one place that
// knows how to turn a resume file into text.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import YAML from "yaml";
import { dataLayers } from "./layers.ts";

// /usr/local/bin/pdftotext on this host is a firejail wrapper, not the real binary; only the
// real path is safe to shell out to, so there is no PATH fallback here.
const PDFTOTEXT = "/usr/bin/pdftotext";

async function extractDocxText(path: string): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(readFileSync(path));
    const parts: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) parts.push(await zip.files[name].async("text"));
    }
    return parts.join(" ").replace(/<[^>]+>/g, " ");
  } catch {
    return null;
  }
}

function extractPdfText(path: string): string | null {
  if (!existsSync(PDFTOTEXT)) return null;
  try {
    return execFileSync(PDFTOTEXT, [path, "-"], { encoding: "utf8" });
  } catch {
    return null;
  }
}

/** Text content of a resume file, or null when its format cannot be read (e.g. no pdftotext). */
export function extractDocumentText(path: string): Promise<string | null> | string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".docx")) return extractDocxText(path);
  if (lower.endsWith(".pdf")) return extractPdfText(path);
  return null;
}

export type Finding = { file: string; line: number; kind: string; snippet: string };
export type Allowlist = { paths: string[]; strings: string[] };

/** Allowlist entries from shared/pii-allow.yaml and custom/pii-allow.yaml: path globs and/or exact matched strings. */
export function loadAllowlist(root: string): Allowlist {
  const out: Allowlist = { paths: [], strings: [] };
  for (const path of dataLayers("pii-allow.yaml", root)) {
    try {
      const data = (YAML.parse(readFileSync(path, "utf8")) ?? {}) as Record<string, unknown>;
      if (Array.isArray(data.paths)) out.paths.push(...data.paths.map(String));
      if (Array.isArray(data.strings)) out.strings.push(...data.strings.map(String));
    } catch {
      // An unreadable allowlist allows nothing extra.
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Minimal glob: `**` crosses path segments, `*` stays within one. */
export function globMatch(pattern: string, value: string): boolean {
  const re = new RegExp(`^${pattern.split("**").map((seg) => seg.split("*").map(escapeRe).join("[^/]*")).join(".*")}$`);
  return re.test(value);
}

export function isAllowed(relPath: string, matched: string, allow: Allowlist): boolean {
  if (allow.strings.includes(matched)) return true;
  return allow.paths.some((p) => globMatch(p, relPath));
}

/** Never print a full matched secret: keep only its first/last character. */
export function mask(s: string): string {
  if (s.length <= 4) return "*".repeat(s.length);
  return `${s.slice(0, 1)}${"*".repeat(s.length - 2)}${s.slice(-1)}`;
}

const SSN = /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
const BIRTH_DATE = /\b(?:dob|date of birth|birth ?date|born)\b[^0-9\n]{0,20}(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
const API_KEY = /\b(?:sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/g;
const STREET_SUFFIX = "(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Circle|Cir|Place|Pl|Way|Terrace|Ter|Trail|Trl|Parkway|Pkwy|Highway|Hwy|Square|Sq)";
// Single spacing and a letter in every street-name word: docx layout numbers separated by long runs
// of spaces ("316470    363040    St.") are not addresses.
const ADDRESS = new RegExp(`\\b\\d{1,6}[ \\t]{1,2}(?:(?=[A-Za-z0-9.']*[A-Za-z])[A-Za-z0-9.']+[ \\t]{1,2}){1,4}${STREET_SUFFIX}\\b\\.?`, "gi");

function luhn(raw: string): boolean {
  const d = raw.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(d)) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0 && d.length >= 13;
}

/** Runs every detector over one line; callers mask before printing. */
export function scanLine(line: string): { kind: string; match: string }[] {
  const hits: { kind: string; match: string }[] = [];
  for (const m of line.matchAll(SSN)) hits.push({ kind: "ssn", match: m[0] });
  for (const m of line.matchAll(BIRTH_DATE)) hits.push({ kind: "birth-date", match: m[0] });
  for (const m of line.matchAll(CARD_CANDIDATE)) if (luhn(m[0])) hits.push({ kind: "card-number", match: m[0] });
  for (const m of line.matchAll(API_KEY)) hits.push({ kind: "api-key", match: m[0] });
  for (const m of line.matchAll(ADDRESS)) hits.push({ kind: "street-address", match: m[0] });
  return hits;
}

/** Extensions `resumes pii` reads as plain text (docx is handled separately, via extraction). */
export const SCAN_TEXT_EXTENSIONS = [".md", ".txt", ".yaml", ".yml", ".json", ".ts", ".csv"];

function walkAll(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Every file under people/, custom/, and shared/ that `resumes pii` knows how to read. */
export function listScannableFiles(root: string): string[] {
  const all = [...walkAll(join(root, "people")), ...walkAll(join(root, "custom")), ...walkAll(join(root, "shared"))];
  return all.filter((f) => {
    const lower = f.toLowerCase();
    return lower.endsWith(".docx") || SCAN_TEXT_EXTENSIONS.some((e) => lower.endsWith(e));
  });
}

/** Scans one file (by absolute `path`, reported as `relPath`) for findings not covered by `allow`. */
export async function scanFile(path: string, relPath: string, allow: Allowlist): Promise<Finding[]> {
  const lower = path.toLowerCase();
  let text: string | null = null;
  if (lower.endsWith(".docx")) text = await extractDocxText(path);
  else if (SCAN_TEXT_EXTENSIONS.some((e) => lower.endsWith(e))) {
    try {
      text = readFileSync(path, "utf8");
    } catch {
      text = null;
    }
  }
  if (text == null) return [];
  const out: Finding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const hit of scanLine(lines[i])) {
      if (isAllowed(relPath, hit.match, allow)) continue;
      out.push({ file: relPath, line: i + 1, kind: hit.kind, snippet: mask(hit.match) });
    }
  }
  return out;
}
