// Session credentials: an account email and a password for one session, typed into a hidden prompt
// so the password never passes through the chat or a hand-edited file. They are kept in the
// git-ignored people/<person>/accounts.local.md, readable only by its owner, and cleared when the
// session ends. Used when the person's `accounts.handling` answer calls for a session password.
import { chmodSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { flag, parseArgs } from "../lib/args.ts";
import { loadAnswers, savedAnswersPath, sessionAnswersPath } from "../lib/catalog.ts";
import type { Command } from "../lib/command.ts";
import { peek, writeDoc } from "../lib/frontmatter.ts";
import { findByType, findOne, personDir, rel, repoRoot, resolvePerson } from "../lib/repo.ts";
import { FILE_NAMES } from "../lib/schema.ts";

export const credentialsPath = (person: string, root = repoRoot()): string => join(personDir(person, root), FILE_NAMES.sessionCredentials);

/** The person's session credentials file, when there is one. */
export function findCredentials(person: string, root = repoRoot()): string | null {
  return findOne(person, "session-credentials", root) ?? (existsSync(credentialsPath(person, root)) ? credentialsPath(person, root) : null);
}

/** Writes the session credentials file, readable only by its owner; returns its path. */
export function saveCredentials(person: string, email: string, password: string, root = repoRoot()): string {
  const path = credentialsPath(person, root);
  writeDoc(path, { type: "session-credentials", person, email, password }, "\nA password for one session. `./resumes credentials clear` removes it; git ignores this file.\n");
  chmodSync(path, 0o600);
  return path;
}

/** Removes every session credentials file of the person; returns the paths removed. */
export function clearCredentials(person: string, root = repoRoot()): string[] {
  const files = new Set([...findByType(personDir(person, root), "session-credentials"), ...(existsSync(credentialsPath(person, root)) ? [credentialsPath(person, root)] : [])]);
  for (const f of files) rmSync(f, { force: true });
  return [...files];
}

/** The account email to suggest: this session's or the saved `accounts.email` answer, else the profile's email. */
function defaultEmail(person: string, root: string): string | undefined {
  for (const path of [sessionAnswersPath(person, root), savedAnswersPath(person, root)]) {
    const answer = loadAnswers(path).get("accounts.email")?.answer;
    if (answer && answer.includes("@")) return answer;
  }
  const profile = findOne(person, "profile", root);
  const email = profile ? peek(profile)?.email : undefined;
  return typeof email === "string" && email ? email : undefined;
}

/** Reads a line from the terminal without showing it. */
function readHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { finish(); resolve(value); return; }
        if (ch === "\u0003" || (ch === "\u0004" && !value)) { finish(); reject(new Error("cancelled")); return; }
        if (ch === "\u007f" || ch === "\b") { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const USAGE = "resumes credentials set [--person p] [--email E] | credentials status [--person p] | credentials clear [--person p]";

const command: Command = {
  name: "credentials",
  summary: "Keep a session password, typed into a hidden prompt, in a git-ignored file, and clear it",
  usage: USAGE,
  async run(argv) {
    const a = parseArgs(argv);
    const root = repoRoot();
    const person = resolvePerson(flag(a, "person"), root);
    switch (a._[0] ?? "status") {
      case "set": {
        if (!process.stdin.isTTY) {
          console.error("run this in a terminal: it asks for the password without showing it, so the password never passes through the chat");
          return 2;
        }
        const email = flag(a, "email") ?? defaultEmail(person, root);
        if (!email) { console.error("no account email: answer accounts.email in onboarding, or pass --email"); return 2; }
        let password: string;
        try {
          password = await readHidden(`Password for job-site accounts as ${email} (not shown): `);
        } catch {
          console.error("cancelled; nothing saved");
          return 1;
        }
        if (!password) { console.error("no password entered; nothing saved"); return 1; }
        const path = saveCredentials(person, email, password, root);
        console.log(`saved for this session in ${rel(path, root)} (git ignores it); \`./resumes credentials clear\` removes it`);
        return 0;
      }
      case "status": {
        const path = findCredentials(person, root);
        if (!path) { console.log("no session password saved"); return 0; }
        const hours = Math.round((Date.now() - statSync(path).mtimeMs) / 3600000);
        console.log(`session password saved for ${String(peek(path)?.email ?? "an unknown email")} in ${rel(path, root)}, ${hours} hour(s) ago`);
        return 0;
      }
      case "clear": {
        const removed = clearCredentials(person, root);
        console.log(removed.length ? `removed ${removed.map((p) => rel(p, root)).join(", ")}` : "no session password to remove");
        return 0;
      }
      default:
        console.error(`usage: ${USAGE}`);
        return 2;
    }
  },
};
export default command;
