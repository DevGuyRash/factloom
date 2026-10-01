// Shared shape for check rules. Each rule module default-exports one `Rule`; tools/src/commands/check.ts
// discovers them from a single registered list (see RULES there) and runs them over one shared `CheckContext`.
export type DocEntry = {
  path: string; // absolute
  rel: string; // relative to the repo root being checked
  data: Record<string, unknown> | null; // frontmatter; null when the file has none
  body: string; // markdown body after the frontmatter fence
  parseError?: string; // set when the frontmatter failed to parse
};

export type CheckContext = {
  root: string;
  docs: DocEntry[];
  /** All parsed docs of a given frontmatter `type`. */
  byType: (type: string) => DocEntry[];
  /** The doc at an exact absolute path, when one was walked. */
  byPath: Map<string, DocEntry>;
};

export type RuleResult = { errors: string[]; warnings: string[] };

export type Rule = {
  name: string;
  run: (ctx: CheckContext) => RuleResult | Promise<RuleResult>;
};

export const noResult = (): RuleResult => ({ errors: [], warnings: [] });
