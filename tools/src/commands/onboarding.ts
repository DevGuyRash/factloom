import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { flag, has, parseArgs } from "../lib/args.ts";
import { formatAnswer, loadAnswers, loadCatalog, openCoreQuestions, savedAnswersPath, sessionAnswersPath, sessionHeader, type CatalogEntry, type Policy } from "../lib/catalog.ts";
import type { Command } from "../lib/command.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { POLICIES } from "../lib/schema.ts";

function upsert(path: string, header: string, entry: string, id: string) {
  const text = existsSync(path) ? readFileSync(path, "utf8") : `${header}\n`;
  const blocks = text.split(/^(?=### )/m);
  const i = blocks.findIndex((b) => b.startsWith(`### ${id}\n`));
  if (i >= 0) blocks[i] = `${entry}\n\n`; else blocks.push(`${blocks[blocks.length - 1].endsWith("\n\n") ? "" : "\n"}${entry}\n`);
  writeFileSync(path, blocks.join(""));
}

/**
 * Session onboarding helper. `onboarding` lists saved answers and the core questions still open, essential ones first;
 * `onboarding start` writes the session-answers file from the saved answers;
 * `onboarding answer <id> <text>` records an answer for this session (and `--save` keeps it).
 */
const command: Command = {
  name: "onboarding",
  summary: "Show open core questions, start the session-answers file, record answers",
  usage: "resumes onboarding [--person p] | onboarding start [--person p] | onboarding answer <id> <answer> [--policy auto|confirm|ask|person] [--save] [--person p]",
  run(argv) {
    const a = parseArgs(argv, ["save"]);
    const person = resolvePerson(flag(a, "person"));
    const sub = a._[0] ?? "status";
    const savedPath = savedAnswersPath(person), sessionPath = sessionAnswersPath(person);
    const catalog = new Map(loadCatalog().map((e) => [e.id, e]));
    if (sub === "start") {
      const saved = loadAnswers(savedPath);
      const entries = [...saved.values()].filter((x) => x.answer).map((x) => formatAnswer({ id: x.id, answer: x.answer, policy: x.policy }));
      writeFileSync(sessionPath, `${sessionHeader(person)}\n${entries.join("\n\n")}${entries.length ? "\n" : ""}`);
      const unconfirmed = [...saved.values()].filter((x) => x.answer && !x.confirmed).length;
      console.log(`wrote ${rel(sessionPath)} with ${entries.length} saved answers${unconfirmed ? `; confirm the ${unconfirmed} without a Confirmed date with the person` : ""}`);
      return 0;
    }
    if (sub === "answer") {
      const [, id, ...words] = a._;
      if (!id || !words.length) { console.error(command.usage); return 2; }
      const policy = (flag(a, "policy") ?? catalog.get(id)?.policy ?? "confirm") as Policy;
      if (!POLICIES.includes(policy)) { console.error(`policy must be one of ${POLICIES.join(", ")}`); return 2; }
      if (!catalog.has(id) && !/^experience\.years\./.test(id)) console.error(`note: ${id} is not in the shared catalog; add it during inbox review`);
      const answer = words.join(" ");
      upsert(sessionPath, sessionHeader(person), formatAnswer({ id, answer, policy }), id);
      if (has(a, "save")) upsert(savedPath, `---\ntype: answers\nperson: ${person}\n---\n\n# Answers\n`, formatAnswer({ id, answer, policy, confirmed: today() }), id);
      console.log(`${id}: ${answer}${has(a, "save") ? " (saved)" : ""}`);
      return 0;
    }
    const saved = loadAnswers(savedPath);
    console.log(`saved answers (${rel(savedPath)}):`);
    for (const x of saved.values()) console.log(`  ${x.confirmed ? "✓" : "?"} ${x.id}: ${x.answer || "(blank)"}${x.confirmed ? "" : "  ← confirm with the person"}`);
    const open = openCoreQuestions(person);
    const groups: [string, CatalogEntry[]][] = [
      [`open essential questions (${open.filter((q) => q.essential).length}): ask these before the first application`, open.filter((q) => q.essential)],
      [`other open core questions (${open.filter((q) => !q.essential).length}): ask in batches once applying has started, or all now if the person prefers`, open.filter((q) => !q.essential)],
    ];
    for (const [title, questions] of groups) {
      console.log(`\n${title}`);
      let section = "";
      for (const q of questions) {
        if (q.section !== section) { section = q.section; console.log(`  ${section}`); }
        console.log(`    ${q.id}: ${q.ask}`);
      }
    }
    console.log(existsSync(sessionPath) ? `\nsession file: ${rel(sessionPath)}` : "\nno session file yet: run `resumes onboarding start`");
    return 0;
  },
};
export default command;
