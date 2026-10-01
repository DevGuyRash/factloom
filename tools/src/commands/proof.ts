import { copyFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { flag, parseArgs } from "../lib/args.ts";
import { listApplications, loadRecord } from "../lib/applications.ts";
import type { Command } from "../lib/command.ts";
import { writeDoc } from "../lib/frontmatter.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";

/** Copies a submission confirmation file into the application directory as confirmation.<ext> and records it. */
const command: Command = {
  name: "proof",
  summary: "Copy a submission confirmation into the application directory and record it",
  usage: "resumes proof <dir> <file> [--person p]",
  run(argv) {
    const a = parseArgs(argv);
    const person = resolvePerson(flag(a, "person"));
    const [dirArg, file] = a._;
    if (!dirArg || !file) throw new Error("proof needs <dir> <file>");
    if (!existsSync(file)) throw new Error(`${file} does not exist`);
    const app = listApplications(person).find((x) => x.dir === dirArg || x.name === dirArg || rel(x.dir) === dirArg);
    if (!app) throw new Error(`no application matches ${dirArg}`);
    const ext = extname(file) || ".txt";
    const destName = `confirmation${ext}`;
    copyFileSync(file, join(app.dir, destName));
    const { data, body } = loadRecord(app);
    // A confirmation number or message recorded by `app submit` stays; the file is recorded beside it.
    if (!data.confirmation) data.confirmation = destName;
    data.proof = destName;
    data.updated = today();
    writeDoc(app.recordPath!, data, body);
    console.log(`copied to ${rel(join(app.dir, destName))}`);
    return 0;
  },
};
export default command;
