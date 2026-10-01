/** A CLI command. Each file in src/commands/ default-exports one; the CLI discovers them by file. */
export type Command = {
  name: string;
  summary: string;
  usage: string;
  run(argv: string[]): Promise<number> | number;
};
