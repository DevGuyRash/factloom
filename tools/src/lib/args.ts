/** Minimal argument parser: positionals, `--key value`, `--key=value`, and boolean `--flag`. */
export type Args = { _: string[]; flags: Record<string, string | true> };

export function parseArgs(argv: string[], booleans: readonly string[] = []): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { out._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) { out.flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (booleans.includes(key) || next === undefined || next.startsWith("--")) out.flags[key] = true;
      else { out.flags[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

export const flag = (a: Args, k: string): string | undefined => (typeof a.flags[k] === "string" ? (a.flags[k] as string) : undefined);
export const has = (a: Args, k: string): boolean => a.flags[k] !== undefined;

/** Repeated `--set key=value` pairs collected into an object (dotted keys nest). */
export function collectSets(argv: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = a === "--set" ? argv[++i] : a.startsWith("--set=") ? a.slice(6) : undefined;
    if (!v) continue;
    const eq = v.indexOf("=");
    if (eq < 1) continue;
    const keys = v.slice(0, eq).split(".");
    let o = out as Record<string, unknown>;
    keys.slice(0, -1).forEach((k) => { o = (o[k] ??= {}) as Record<string, unknown>; });
    o[keys[keys.length - 1]] = v.slice(eq + 1);
  }
  return out;
}
