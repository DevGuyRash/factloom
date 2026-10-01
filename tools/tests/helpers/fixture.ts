// Throwaway repository for tests: AGENTS.md + people/ + shared templates copied from the real repo.
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function makeFixture(files: Record<string, string> = {}): { root: string; write: (rel: string, text: string) => string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "resumes-fixture-"));
  writeFileSync(join(root, "AGENTS.md"), "# fixture\n");
  mkdirSync(join(root, "people"), { recursive: true });
  cpSync(join(REAL_ROOT, "shared", "templates", "documents"), join(root, "shared", "templates", "documents"), { recursive: true });
  const write = (rel: string, text: string) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  write("people/pat-lee/profile.md", "---\ntype: profile\nperson: pat-lee\nname: Pat Lee\nemail: pat@example.com\nphone: (555) 010-0100\nlocation: Phoenix, AZ\nlinks:\n  - https://github.com/example\napply: enabled\n---\n");
  for (const [k, v] of Object.entries(files)) write(k, v);
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
