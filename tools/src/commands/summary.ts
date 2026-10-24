// Summary review is a caller's assertion of completed review, not factual certification.
import { closeSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { flag, has, parseArgs } from "../lib/args.ts";
import type { Command } from "../lib/command.ts";
import { repoRoot, resolvePerson } from "../lib/repo.ts";
import { factsPath, loadFacts, resolveSummary, type Facts } from "../render/spec.ts";

/** Explicit single-writer review: cooperative lock, compare-before-write, atomic replacement.
 * Uncoordinated editors must finish first; the filesystem does not offer atomic compare-and-swap. */
export function reviewSummary(person: string, id: string, channel: string, expected: string, root = repoRoot()): string {
  const path = factsPath(person, root);
  const lock = `${path}.summary-review.lock`;
  const fd = openSync(lock, "wx");
  const temporary = `${lock}.tmp`;
  try {
    const original = readFileSync(path, "utf8");
    const doc = YAML.parseDocument(original);
    if (doc.errors.length) throw new Error(`invalid facts YAML: ${doc.errors[0].message}`);
    const facts = doc.toJS() as Facts;
    if (facts.person !== person) throw new Error("facts owner does not match selected person");
    const summary = resolveSummary(facts, id, channel);
    if (summary.digest !== expected) throw new Error("summary digest changed or does not match; inspect and review the current text and evidence first");
    if (summary.holds.length) throw new Error(`summary has unresolved evidence holds: ${summary.holds.join("; ")}`);
    if (summary.review_status === "current") return summary.digest;
    doc.setIn(["summaries", id, "channels", channel, "reviewed"], summary.digest);
    writeFileSync(temporary, doc.toString({ lineWidth: 0 }), { flag: "wx", mode: statSync(path).mode & 0o777 });
    if (readFileSync(path, "utf8") !== original) throw new Error("facts changed while recording review; inspect again");
    renameSync(temporary, path);
    return summary.digest;
  } finally {
    closeSync(fd);
    rmSync(temporary, { force: true });
    rmSync(lock, { force: true });
  }
}

const command: Command = {
  name: "summary",
  summary: "Inspect, explicitly record review, or export a named summary channel from facts.yaml",
  usage: "resumes summary inspect|show|review --person <slug> --summary <id> --channel <name> [--format text|json] [--allow-unreviewed] [--expected <digest>]",
  run(argv) {
    const args = parseArgs(argv, ["allow-unreviewed"]);
    const action = args._[0];
    const id = flag(args, "summary"), channel = flag(args, "channel");
    if (!["inspect", "show", "review"].includes(action) || !id || !channel) throw new Error(command.usage);
    const root = repoRoot(), person = resolvePerson(flag(args, "person"), root);
    const facts = loadFacts(person, root);
    if (facts.person !== person) throw new Error("facts owner does not match selected person");
    const summary = resolveSummary(facts, id, channel);
    if (action === "review") {
      const expected = flag(args, "expected");
      if (!expected) throw new Error("review requires --expected <digest> from summary inspect, after reviewing its exact text and evidence");
      console.log(`recorded caller review: ${reviewSummary(person, id, channel, expected, root)}`);
      return 0;
    }
    if (action === "inspect") { console.log(JSON.stringify(summary, null, 2)); return 0; }
    const format = flag(args, "format") ?? "text";
    if (format !== "text" && format !== "json") throw new Error("--format must be text or json");
    const preview = summary.review_status !== "current" || summary.holds.length > 0;
    if (preview && !has(args, "allow-unreviewed")) throw new Error(`summary requires review (${summary.review_status})${summary.holds.length ? `; ${summary.holds.join("; ")}` : ""}; inspect it first or use --allow-unreviewed --format json for a preview`);
    if (preview && format !== "json") throw new Error("unreviewed previews require --format json so review status and holds remain visible");
    const { evidence: _evidence, support_context: _context, ...projection } = summary;
    console.log(format === "text" ? summary.text : JSON.stringify({ version: 1, ...projection, preview }, null, 2));
    return 0;
  },
};
export default command;
