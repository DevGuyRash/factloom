import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";

export type Doc<T = Record<string, unknown>> = { data: T; body: string };

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Splits Markdown into its YAML frontmatter and body; `data` is null when there is no frontmatter. */
export function parse(text: string): { data: Record<string, unknown> | null; body: string } {
  const m = text.match(FENCE);
  if (!m) return { data: null, body: text };
  const data = YAML.parse(m[1]) ?? {};
  if (typeof data !== "object" || Array.isArray(data)) throw new Error("frontmatter is not a mapping");
  return { data: data as Record<string, unknown>, body: m[2] };
}

export function stringify(data: Record<string, unknown>, body = ""): string {
  const yaml = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body.startsWith("\n") || body === "" ? body : `\n${body}`}`;
}

export function readDoc<T = Record<string, unknown>>(path: string): Doc<T> {
  const { data, body } = parse(readFileSync(path, "utf8"));
  if (!data) throw new Error(`${path}: missing frontmatter`);
  return { data: data as T, body };
}

/** Reads only the frontmatter; null when the file has none or it does not parse. */
export function peek(path: string): Record<string, unknown> | null {
  try {
    return parse(readFileSync(path, "utf8")).data;
  } catch {
    return null;
  }
}

export function writeDoc(path: string, data: Record<string, unknown>, body = ""): void {
  writeFileSync(path, stringify(data, body));
}
