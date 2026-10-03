// Tab completion for ./resumes. A command's grammar (its subcommands, flags, and what each takes) is
// read from its `usage` string, the one place it is already written down, so completion cannot drift
// from the commands; values come from the repository (people, variants, themes, onboarding ids, ...).
// The shell scripts in tools/completions/ only ask `resumes __complete` and print its answer, so they
// need no regenerating after an engine update.
//
// Conventions a `usage` string follows (the parser relies on them):
//   - `<name>` is a placeholder; a bare lowercase word is a literal keyword. Keywords right after the
//     command name are subcommands (`resumes queue add ...`); `a|b|c` lists alternatives.
//   - After a flag, the next token is its value (`--format csv|json`, `--person <slug>`); a flag with
//     nothing after it, or closing its bracket, is a switch (`[--force]`).
//   - A trailing `...` repeats the item; parentheses hold notes the parser skips.
//   - Placeholder names carry meaning: `<variant>`, `<theme>`, `<catalog-id>`, `<search-id>`,
//     `<template>`, and `<remote>` complete from the repository; a name ending in `dir` (or `root`)
//     completes directories; one containing `file`, ending in `.md`, `.json`, and the like, or `path`
//     completes files. `--person`, `--variant`, `--theme`, and `--themes` complete by flag name.
//     Anything else (`<name>`, `U`, `TEXT`) is free text and offers nothing.
import { loadCatalog } from "./catalog.ts";
import type { Command } from "./command.ts";
import { remotes } from "./git.ts";
import { listPeople, repoRoot, resolvePerson } from "./repo.ts";
import { loadSearches } from "./searches.ts";
import { listTemplates } from "./templates.ts";
import { listVariants } from "../render/spec.ts";
import { listThemes } from "../render/theme.ts";

export type Provider = "person" | "variant" | "theme" | "catalog-id" | "search-id" | "template" | "remote";
/** What a flag value or positional can be: nothing offerable, fixed choices, values from the repository, or paths. */
export type Spec =
  | { kind: "text" }
  | { kind: "choices"; values: string[] }
  | { kind: "provider"; provider: Provider; list?: boolean }
  | { kind: "path"; dirs: boolean };
export type Flag = { name: string; value: Spec | null; repeatable: boolean };
export type Positional = { spec: Spec; repeatable: boolean };
/** One way to call a command: its subcommand words (empty for the plain form), flags, and positionals in order. */
export type Form = { words: string[]; flags: Flag[]; positionals: Positional[] };

const TEXT: Spec = { kind: "text" };
const WORD = /^[a-z][a-z0-9-]*$/;
const KEYWORDS = /^[a-z][a-z0-9-]*(\|[a-z][a-z0-9-]*)*$/;
const FLAG = /^--[a-z][a-z0-9-]*$/;
const PROVIDERS: Record<string, Provider> = {
  variant: "variant",
  theme: "theme",
  "catalog-id": "catalog-id",
  "search-id": "search-id",
  template: "template",
  remote: "remote",
};

/** Drops the optional-group brackets around a token. */
const norm = (token: string): string => token.replace(/^\[+/, "").replace(/\]+$/, "");

/** Splits one usage line into the alternative forms joined by ` | `, outside brackets and quotes. */
function splitForms(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "[" || c === "<")) depth++;
    else if (!quoted && (c === "]" || c === ">")) depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0 && line.startsWith(" | ", i)) {
      out.push(line.slice(start, i));
      start = i + 3;
      i += 2;
    }
  }
  out.push(line.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** The kind a placeholder name stands for. */
function specOfName(name: string): Spec {
  const n = name.toLowerCase();
  if (PROVIDERS[n]) return { kind: "provider", provider: PROVIDERS[n] };
  if (/(^|-)dir$|^root$|^folder$/.test(n)) return { kind: "path", dirs: true };
  if (/file|\.(md|json|ya?ml|docx|pdf|txt)$|^paths?$/.test(n)) return { kind: "path", dirs: false };
  return TEXT;
}

/** The spec of a flag value or positional placeholder; `flag` is the flag it follows, when it follows one. */
function specOf(raw: string, flag?: string): Spec {
  if (raw.startsWith('"')) return TEXT;
  const core = raw.replace(/\.\.\.$/, "").replace(/^<|>$/g, "");
  if (flag === "person") return { kind: "provider", provider: "person" };
  if (flag === "variant") return { kind: "provider", provider: "variant" };
  if (flag === "theme" || flag === "themes") return { kind: "provider", provider: "theme", list: flag === "themes" || core.includes(",") };
  const pieces = core.split("|");
  if (pieces.length > 1) {
    const words = pieces.filter((p) => WORD.test(p));
    const open = pieces.filter((p) => p.includes("<"));
    // Fixed alternatives, such as csv|json; a piece with a placeholder inside (derived:<source>) is open-ended and left out.
    if (words.length + open.length === pieces.length && words.length >= (open.length ? 1 : 2)) return { kind: "choices", values: words };
  }
  return specOfName(pieces[0]);
}

function parseForm(tokens: string[]): Form {
  const form: Form = { words: [], flags: [], positionals: [] };
  let i = 0;
  if (tokens[0] !== undefined && KEYWORDS.test(norm(tokens[0]))) {
    form.words = norm(tokens[0]).split("|");
    i = 1;
  }
  const dots = (t: string | undefined) => t !== undefined && norm(t) === "...";
  while (i < tokens.length) {
    const raw = tokens[i];
    const t = norm(raw);
    if (t === "" || t === "--" || t === "...") { i++; continue; }
    if (FLAG.test(t)) {
      const name = t.slice(2);
      const next = tokens[i + 1];
      const takesValue = !raw.endsWith("]") && next !== undefined && !next.startsWith("[") && !norm(next).startsWith("--") && !dots(next);
      if (!takesValue) {
        form.flags.push({ name, value: null, repeatable: false });
        i++;
        continue;
      }
      const value = norm(next);
      form.flags.push({ name, value: specOf(value, name), repeatable: value.endsWith("...") || dots(tokens[i + 2]) });
      i += dots(tokens[i + 2]) ? 3 : 2;
      continue;
    }
    const repeatable = t.endsWith("...") || dots(tokens[i + 1]);
    const core = t.replace(/\.\.\.$/, "");
    // A bare lowercase word or list after a positional is a fixed keyword (`<dir> rejected|offer`).
    const spec: Spec = !core.startsWith("<") && !core.startsWith('"') && KEYWORDS.test(core) ? { kind: "choices", values: core.split("|") } : specOf(core);
    form.positionals.push({ spec, repeatable });
    i += dots(tokens[i + 1]) ? 2 : 1;
  }
  return form;
}

/** The forms of a command's `usage` string (one per alternative; see the conventions above). */
export function parseUsage(usage: string, command: string): Form[] {
  const forms: Form[] = [];
  for (const line of usage.replace(/\([^)]*\)/g, " ").split("\n")) {
    for (const segment of splitForms(line)) {
      const tokens = segment.match(/(?:"[^"]*"|\S)+/g) ?? [];
      if (tokens[0] === "resumes") tokens.shift();
      if (tokens[0] === command) forms.push(parseForm(tokens.slice(1)));
    }
  }
  return forms;
}

export type Candidate = { value: string; description?: string };
/** What the shell does after the candidates: nothing, or its own file or directory completion. */
export type Fallback = "none" | "files" | "dirs";
export type Completion = { candidates: Candidate[]; fallback: Fallback };

const NONE: Completion = { candidates: [], fallback: "none" };

/** The command names (and `help`) starting with `cur`. */
function commandCandidates(cur: string, commands: Map<string, Command>): Completion {
  const candidates: Candidate[] = [...commands.values()]
    .filter((c) => !c.hidden && c.name.startsWith(cur))
    .map((c) => ({ value: c.name, description: c.summary }))
    .sort((a, b) => a.value.localeCompare(b.value));
  if ("help".startsWith(cur)) candidates.push({ value: "help", description: "Show a command's usage" });
  if (cur.startsWith("-") && "--help".startsWith(cur)) candidates.push({ value: "--help" });
  return { candidates, fallback: "none" };
}

const unique = (values: string[]): string[] => [...new Set(values)];

/** Values a provider offers, from the current repository (nothing when the repository cannot be read). */
function providerValues(provider: Provider, person: string | undefined): string[] {
  try {
    const root = repoRoot();
    // The person named with --person, else the one person applications are enabled for.
    const sole = (): string | undefined => {
      if (person) return person;
      try {
        return resolvePerson(undefined, root);
      } catch {
        return undefined;
      }
    };
    // Per-person values for that person, or for everyone when none is settled.
    const people = (): string[] => {
      const p = sole();
      return p ? [p] : listPeople(root);
    };
    switch (provider) {
      case "person": return listPeople(root);
      case "variant": return unique(people().flatMap((p) => listVariants(p, root)));
      case "theme": return listThemes(root, sole()).map((t) => t.name);
      // An id with a placeholder in it (experience.years.<skill>) is a pattern, not something to type.
      case "catalog-id": return loadCatalog(root).map((e) => e.id).filter((id) => !id.includes("<"));
      case "search-id": return unique(people().flatMap((p) => loadSearches(p, root).items.map((i) => i.id)));
      case "template": return unique(people().flatMap((p) => listTemplates(p, root)));
      case "remote": return remotes(root).map((r) => r.name);
    }
  } catch {
    return [];
  }
}

const merge = (a: Fallback, b: Fallback): Fallback => (a === "files" || b === "files" ? "files" : a === "dirs" || b === "dirs" ? "dirs" : "none");

/** What `spec` offers for the word `cur`: candidates, and the shell fallback for paths. */
function offer(spec: Spec | undefined, cur: string, person: string | undefined): Completion {
  if (!spec) return NONE;
  switch (spec.kind) {
    case "text": return NONE;
    case "path": return { candidates: [], fallback: spec.dirs ? "dirs" : "files" };
    case "choices": return { candidates: spec.values.filter((v) => v.startsWith(cur)).map((value) => ({ value })), fallback: "none" };
    case "provider": {
      // A comma list (--themes a,b) completes its last item and keeps the ones before it.
      const head = spec.list ? cur.slice(0, cur.lastIndexOf(",") + 1) : "";
      const tail = cur.slice(head.length);
      const done = new Set(head.split(",").filter(Boolean));
      const values = providerValues(spec.provider, person).filter((v) => v.startsWith(tail) && !done.has(v)).sort();
      return { candidates: values.map((v) => ({ value: head + v })), fallback: "none" };
    }
  }
}

function completeArguments(forms: Form[], rest: string[], cur: string): Completion {
  const flagOf = (token: string, among: Form[]): Flag | undefined => {
    const name = token.slice(2);
    return among.flatMap((f) => f.flags).find((f) => f.name === name);
  };
  // Words typed so far, split into flags (and their values) and positionals.
  const positionals: string[] = [];
  const flagsUsed = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === "--") { positionals.push(...rest.slice(i + 1)); break; }
    if (t.startsWith("--")) {
      const f = flagOf(t, forms);
      if (t.includes("=")) flagsUsed.set(t.slice(2, t.indexOf("=")), t.slice(t.indexOf("=") + 1));
      else if (f?.value && i + 1 < rest.length) { flagsUsed.set(f.name, rest[i + 1]); i++; } else flagsUsed.set(t.slice(2), true);
      continue;
    }
    positionals.push(t);
  }
  const subWords = new Set(forms.flatMap((f) => f.words));
  const sub = positionals.length && subWords.has(positionals[0]) ? positionals.shift() : undefined;
  const applicable = sub ? forms.filter((f) => f.words.includes(sub)) : forms;
  const plain = sub ? applicable : forms.filter((f) => f.words.length === 0);
  const personFlag = flagsUsed.get("person");
  const person = typeof personFlag === "string" ? personFlag : undefined;

  const prev = rest[rest.length - 1];
  if (prev !== undefined && prev.startsWith("--") && !prev.includes("=") && !cur.startsWith("--")) {
    const f = flagOf(prev, applicable);
    if (f?.value) return offer(f.value, cur, person);
  }

  const flagCandidates = (): Candidate[] => {
    const seen = new Set<string>();
    for (const f of applicable.flatMap((x) => x.flags)) if (f.repeatable || !flagsUsed.has(f.name)) seen.add(`--${f.name}`);
    return [...seen].filter((n) => n.startsWith(cur)).sort().map((value) => ({ value }));
  };
  if (cur.startsWith("-")) return { candidates: flagCandidates(), fallback: "none" };

  // The next positional: a subcommand word, or what the plain form(s) expect at this position.
  const result: Completion = { candidates: [], fallback: "none" };
  if (!sub) for (const w of [...subWords].sort()) if (w.startsWith(cur)) result.candidates.push({ value: w });
  for (const form of plain) {
    const last = form.positionals[form.positionals.length - 1];
    const slot = form.positionals[positionals.length] ?? (last?.repeatable ? last : undefined);
    const got = offer(slot?.spec, cur, person);
    result.candidates.push(...got.candidates);
    result.fallback = merge(result.fallback, got.fallback);
  }
  result.candidates = [...new Map(result.candidates.map((c) => [c.value, c])).values()];
  // With nothing else to offer on an empty word, show the flags: they are how the command is shaped.
  if (!result.candidates.length && result.fallback === "none" && cur === "") result.candidates = flagCandidates();
  return result;
}

/**
 * Candidates for the words typed after the program name, the last being the word under the cursor
 * (empty when the cursor follows a space). `commands` is the registry (`loadCommands`).
 */
export function complete(words: string[], commands: Map<string, Command>): Completion {
  const typed = words.length ? words : [""];
  const cur = typed[typed.length - 1];
  const before = typed.slice(0, -1);
  if (!before.length) return commandCandidates(cur, commands);
  const [name, ...rest] = before;
  if (name === "help") return before.length === 1 ? commandCandidates(cur, commands) : NONE;
  const command = commands.get(name);
  return command ? completeArguments(parseUsage(command.usage, name), rest, cur) : NONE;
}
