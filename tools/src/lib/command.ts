/**
 * A CLI command. Each file in src/commands/ default-exports one; the CLI discovers them by file.
 * `usage` is also the grammar tab completion reads (src/lib/complete.ts explains its conventions), so
 * keep it complete: every flag the command reads belongs in it. `hidden` keeps a command out of `help`.
 */
export type Command = {
  name: string;
  summary: string;
  usage: string;
  hidden?: boolean;
  run(argv: string[]): Promise<number> | number;
};
