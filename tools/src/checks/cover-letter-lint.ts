// Cover-letter checks, shared by `resumes check` (every letter) and `resumes letter` (before it
// renders one): the letter sits in an application directory whose record's company/role match the
// letter's own frontmatter (when the letter states them), the body mentions the company, it carries
// no draft markers, and it repeats no phrase the person has not confirmed (facts.yaml `confirm`).
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { DRAFT_MARKERS } from "../lib/schema.ts";
import { normalizeCompany, sameEmployer } from "../lib/text.ts";
import { allConfirms, factsPath, loadFacts } from "../render/spec.ts";
import type { CheckContext, Rule } from "./types.ts";

function unconfirmedPhrases(root: string, person: string): string[] {
  if (!existsSync(factsPath(person, root))) return [];
  try {
    return allConfirms(loadFacts(person, root));
  } catch {
    return [];
  }
}

type LetterInput = {
  rel: string;
  body: string;
  data?: Record<string, unknown> | null;
  record?: Record<string, unknown> | null;
  person?: string;
  root: string;
};

/** Everything wrong with one letter, each message prefixed with `rel`; empty when the letter may be sent. */
export function letterProblems({ rel, body, data, record, person, root }: LetterInput): string[] {
  const errors: string[] = [];
  const hit = body.match(DRAFT_MARKERS);
  if (hit) errors.push(`${rel}: letter text contains '${hit[0]}'`);

  if (!record) {
    errors.push(`${rel}: no application record in its directory`);
  } else {
    const recCompany = record.company != null ? String(record.company) : undefined;
    const recRole = record.role != null ? String(record.role) : undefined;
    const letterCompany = data?.company != null ? String(data.company) : undefined;
    const letterRole = data?.role != null ? String(data.role) : undefined;
    // A letter may use the employer's everyday name ("Amazon" for "Amazon.com Services LLC") when it is a shorter form of the record's.
    if (letterCompany && recCompany && !sameEmployer(letterCompany, recCompany)) {
      errors.push(`${rel}: company '${letterCompany}' does not match the application record's '${recCompany}'`);
    }
    if (letterRole && recRole && letterRole.trim().toLowerCase() !== recRole.trim().toLowerCase()) {
      errors.push(`${rel}: role '${letterRole}' does not match the application record's '${recRole}'`);
    }
    const company = letterCompany ?? recCompany;
    if (company && !normalizeCompany(body).includes(normalizeCompany(company))) {
      errors.push(`${rel}: letter body does not mention ${company}${letterCompany ? "" : " (a letter that uses a shorter name sets `company:` in its frontmatter to that name)"}`);
    }
  }

  const who = person ?? (typeof data?.person === "string" ? data.person : undefined);
  if (who) {
    for (const phrase of unconfirmedPhrases(root, who)) {
      if (body.toLowerCase().includes(phrase.toLowerCase())) errors.push(`${rel}: letter repeats unconfirmed phrase '${phrase}'`);
    }
  }
  return errors;
}

const rule: Rule = {
  name: "cover-letter-lint",
  run(ctx: CheckContext) {
    const errors: string[] = [];
    for (const doc of ctx.byType("cover-letter")) {
      const appDir = dirname(doc.path);
      const record = ctx.docs.find((d) => dirname(d.path) === appDir && d.data?.type === "application");
      errors.push(...letterProblems({ rel: doc.rel, body: doc.body, data: doc.data, record: record?.data, root: ctx.root }));
    }
    return { errors, warnings: [] };
  },
};
export default rule;
