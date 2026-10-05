import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { flag, has, parseArgs } from "../lib/args.ts";
import { formatAnswer, loadAnswers, loadCatalog, loadKeptAnswers, openCoreQuestions, privateAnswersPath, savedAnswersPath, sessionAnswersPath, sessionHeader, type Answer, type CatalogEntry, type Policy } from "../lib/catalog.ts";
import type { Command } from "../lib/command.ts";
import { peek } from "../lib/frontmatter.ts";
import { listApplications } from "../lib/applications.ts";
import { skipsByRule } from "../lib/queue.ts";
import { rel, resolvePerson, today } from "../lib/repo.ts";
import { similarity } from "../lib/text.ts";
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
  usage: 'resumes onboarding [--person p] | onboarding start [--fresh] [--person p] | onboarding find "<question as asked>" [--person p] | onboarding answer <catalog-id> <answer> [--notes <text>] [--policy auto|confirm|ask|person] [--save] [--person p]',
  run(argv) {
    const a = parseArgs(argv, ["save", "fresh"]);
    const person = resolvePerson(flag(a, "person"));
    const sub = a._[0] ?? "status";
    const savedPath = savedAnswersPath(person), sessionPath = sessionAnswersPath(person);
    const catalog = new Map(loadCatalog().map((e) => [e.id, e]));
    if (sub === "start") {
      const saved = loadKeptAnswers(person);
      // The last session's answers carry over: the person gave them, and they stand until changed. A saved
      // answer confirmed after that session is newer and wins. --fresh starts from the saved answers alone.
      const previous = has(a, "fresh") || !existsSync(sessionPath) ? new Map<string, Answer>() : loadAnswers(sessionPath);
      const previousDate = existsSync(sessionPath) ? String(peek(sessionPath)?.session ?? "") : "";
      const merged = new Map<string, Answer>();
      // Notes (per-employer exceptions, wording for free-text fields) travel with their answers.
      for (const x of saved.values()) if (x.answer) merged.set(x.id, { id: x.id, answer: x.answer, policy: x.policy, notes: x.notes, source: x.source });
      let carried = 0;
      for (const x of previous.values()) {
        if (!x.answer) continue;
        const s = saved.get(x.id);
        const newerSaved = s?.confirmed && previousDate && s.confirmed > previousDate;
        if (newerSaved) continue;
        if (s?.answer !== x.answer) carried++;
        merged.set(x.id, { id: x.id, answer: x.answer, policy: x.policy, notes: x.notes ?? (s?.answer === x.answer ? s.notes : undefined), source: x.source });
      }
      const entries = [...merged.values()].map(formatAnswer);
      writeFileSync(sessionPath, `${sessionHeader(person)}\n${entries.join("\n\n")}${entries.length ? "\n" : ""}`);
      const unconfirmed = [...saved.values()].filter((x) => x.answer && !x.confirmed).length;
      const noted = [...merged.values()].filter((x) => x.notes).map((x) => x.id);
      console.log(`wrote ${rel(sessionPath)} with ${entries.length} answers (${carried} carried over from the last session)${unconfirmed ? `; ${unconfirmed} saved answers have no Confirmed date and came from notes or the profile` : ""}`);
      if (noted.length) console.log(`answers with notes (exceptions or wording that change how they apply): ${noted.join(", ")}`);
      return 0;
    }
    if (sub === "find") {
      // The catalog entries a form's question most likely is, with this session's answer: no reading 400 lines.
      const asked = a._.slice(1).join(" ");
      if (!asked) throw new Error('onboarding find needs "<question as asked>"');
      const session = loadAnswers(sessionPath), saved = loadAnswers(savedPath);
      const words = (s: string) => s.replace(/[._<>-]/g, " ");
      const ranked = [...catalog.values()]
        .map((e) => ({ e, s: Math.max(similarity(asked, words(e.id)), similarity(asked, e.ask), ...(e.seenAs ?? "").split(/",\s*"/).map((p) => similarity(asked, p))) }))
        .sort((x, y) => y.s - x.s)
        .slice(0, 5);
      for (const { e, s } of ranked) {
        const answer = session.get(e.id)?.answer ?? saved.get(e.id)?.answer ?? loadAnswers(privateAnswersPath(person)).get(e.id)?.answer;
        const shown = answer && e.local ? "answered (kept privately; read it from the private file)" : answer ? `answer: ${answer}` : "no answer yet";
        console.log(`${e.id} (${e.policy}, match ${s.toFixed(2)}): ${shown}\n  ask: ${e.ask}`);
      }
      return 0;
    }
    if (sub === "answer") {
      const [, id, ...words] = a._;
      if (!id || !words.length) { console.error(command.usage); return 2; }
      // One skill's years (experience.years.python) follow the catalog's experience.years.<skill> entry.
      const entry = catalog.get(id) ?? (/^experience\.years\./.test(id) ? catalog.get("experience.years.<skill>") : undefined);
      const policy = (flag(a, "policy") ?? entry?.policy ?? "confirm") as Policy;
      if (!POLICIES.includes(policy)) { console.error(`policy must be one of ${POLICIES.join(", ")}`); return 2; }
      if (!entry) {
        // An id made up on the spot is never found again by a later form; name the entries it most resembles.
        const spaced = (s: string) => s.replace(/[._<>-]/g, " ");
        const near = [...catalog.values()].map((e) => ({ id: e.id, s: Math.max(similarity(spaced(id), spaced(e.id)), similarity(spaced(id), e.ask)) }))
          .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3).map((x) => x.id);
        console.error(`note: ${id} is not in the catalog${near.length ? `; closest: ${near.join(", ")}` : ""}. Use a catalog id when one fits (onboarding find "<question as asked>"); a new question goes to the inbox for the catalog.`);
      }
      const answer = words.join(" ");
      // Notes stay with an answer until replaced (--notes "<text>") or cleared (--notes "").
      const sessionPrev = loadAnswers(sessionPath).get(id), savedPrev = loadAnswers(savedPath).get(id);
      const notes = flag(a, "notes") ?? sessionPrev?.notes ?? (savedPrev?.answer === answer ? savedPrev.notes : undefined);
      upsert(sessionPath, sessionHeader(person), formatAnswer({ id, answer, policy, notes, source: sessionPrev?.source }), id);
      if (has(a, "save")) {
        // A private detail is kept, but only in the git-ignored private file, never in the committed answers file.
        const keepPath = entry?.local ? privateAnswersPath(person) : savedPath;
        const header = entry?.local ? `---\ntype: private\nperson: ${person}\n---\n\n# Private details (kept out of git)\n` : `---\ntype: answers\nperson: ${person}\n---\n\n# Answers\n`;
        const keptPrev = loadAnswers(keepPath).get(id);
        const savedNotes = flag(a, "notes") ?? notes ?? keptPrev?.notes;
        upsert(keepPath, header, formatAnswer({ id, answer, policy, confirmed: today(), notes: savedNotes, source: keptPrev?.source }), id);
      }
      console.log(`${id}: ${answer}${has(a, "save") ? (entry?.local ? " (saved in the private file, which git ignores)" : " (saved)") : ""}${notes ? `\n  notes: ${notes}` : ""}`);
      // Held applications waiting on this answer can go ahead now.
      const apps = listApplications(person);
      const waiting = apps.filter((x) => x.record?.status === "blocked" && x.record.waits_on === id);
      if (waiting.length) console.log(`held applications waiting on ${id}: ${waiting.map((x) => x.name).join(", ")} (reopen them: app reopen <dir> --reason "answered")`);
      const pendingOn = apps.filter((x) => x.record?.status === "submitted" && x.record.pending_waits_on === id);
      if (pendingOn.length) console.log(`sent applications with a step waiting on ${id}: ${pendingOn.map((x) => x.name).join(", ")}`);
      // What the earlier answer ruled out, to screen again when the new one widens it.
      const ruledOut = skipsByRule(person).get(id);
      const n = ruledOut ? ruledOut.queue.length + ruledOut.apps.length : 0;
      if (n) console.log(`${n} posting(s) were skipped under ${id}: if this answer lets any back in, see them with \`queue list --rule ${id}\` (queue reopen, or app reopen)`);
      // An answer is the value a form takes; who said it and when belong in --notes.
      if (/^(\d{4}-\d{2}-\d{2}\b|[A-Z][\w.'-]*(?: [A-Z][\w.'-]*)?,? (?:\d{4}-\d{2}-\d{2}|said|wrote)\b)/.test(answer)) {
        console.log("note: an answer is the value a form takes; put who said it and when, and their own words, in --notes");
      }
      return 0;
    }
    const saved = loadAnswers(savedPath);
    console.log(`saved answers (${rel(savedPath)}):`);
    for (const x of saved.values()) console.log(`  ${x.confirmed ? "✓" : "?"} ${x.id}: ${x.answer || "(blank)"}${x.confirmed ? "" : "  ← confirm with the person"}`);
    // Private answers are named, not shown: read the private file when a form needs one.
    const kept = [...loadAnswers(privateAnswersPath(person)).values()].filter((x) => x.answer);
    if (kept.length) console.log(`kept privately (${rel(privateAnswersPath(person))}, ignored by git): ${kept.map((x) => x.id).join(", ")}`);
    const open = openCoreQuestions(person);
    const groups: [string, CatalogEntry[]][] = [
      [`open essential questions (${open.filter((q) => q.essential).length}): forms ask these most; settle them before applying while the person is here, otherwise the applications that need one wait on it`, open.filter((q) => q.essential)],
      [`other open core questions (${open.filter((q) => !q.essential).length}): ask in batches while the person is here, or all before a run they will not attend`, open.filter((q) => !q.essential)],
    ];
    for (const [title, questions] of groups) {
      console.log(`\n${title}`);
      let section = "";
      for (const q of questions) {
        if (q.section !== section) { section = q.section; console.log(`  ${section}`); }
        // Entries that say how to derive or propose the answer are for you to work out and the person to confirm.
        console.log(`    ${q.id}${/^Derived|\bPropose\b/.test(q.ask) ? " [propose from the records]" : ""}: ${q.ask}`);
      }
    }
    console.log(existsSync(sessionPath) ? `\nsession file: ${rel(sessionPath)}` : "\nno session file yet: run `resumes onboarding start`");
    return 0;
  },
};
export default command;
