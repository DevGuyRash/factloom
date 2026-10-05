---
name: resume-builder
description: Build a person's resume from nothing, or rebuild one that is not working, with them - interview them for what they actually did, research what their target roles and readers look for now, write it, and have a reader who did not write it review it skeptically - producing the facts, variants, and guides this repository renders. Use when a person has no resume, or asks for a new or much stronger one.
---

# Resume builder

A resume is evidence that this person can do the work a reader is hiring for. Build it from what they have actually done, worded so that a skeptical hiring manager in their field believes it on a first read, an applicant system extracts it intact, and an AI screener summarizes it correctly. The repository keeps it the way it keeps every resume (the job-application skill's [resumes reference](../job-application/references/resumes.md)): each claim once in `people/<person>/resumes/source/facts.yaml` with its source in `evidence.md`, a variant per kind of role choosing and ordering claims, a theme for the look, and a guide saying what each variant is for. When the person has no directory yet, AGENTS.md's "First run" comes first.

## What holds throughout

- Every claim is the person's own, or comes from a source they point you to (a review, a repository, a published piece), recorded in `evidence.md`. You suggest structure and wording; titles, dates, numbers, and outcomes come from them. A claim you reword or infer keeps its exact phrase in the bullet's `confirm` list until they approve it, and a claim they cannot confirm stays out.
- Research decides emphasis, order, and words; it never adds a claim. A requirement the market wants that the person cannot show is a gap to tell them about.
- The writing comes from this person's material and this field's readers, not from a template. The commands render, check minimums, and keep every claim traceable; what to say, and how long and in what order, are decisions you make for this person and explain to them.

## The work

1. **Target.** Settle what the resume is for: the roles, level, field, places, and kinds of employers the person wants, and what a reader should conclude. Record it in their words in the profile's search focus.
2. **Research** before drafting ([research](references/research.md)): what employers for these targets ask for now, how they read and screen resumes, and what a strong resume in this field looks like today. Go where this person's field leads, beyond the directions listed there, and keep sources with dates.
3. **Interview** for the raw material ([interviewing](references/interviewing.md)): their records first, then a timeline, then incidents with their scale, tools, and consequences, one question at a time. Write what they say into `facts.yaml` and `evidence.md` as you go, in their words.
4. **Write** ([writing](references/writing.md)): decide this resume's length, order, sections, and what leads, from the research and their material, and say why. `./resumes variant new <name> --person <slug>` starts a variant listing every fact; choose, order, and word; `./resumes build-resumes --person <slug> --variant <name>` renders it and reports anything below the floor (a role without bullets, a fragment, a repeat, a job without dates, placeholder text, or a line the built file's text does not give back). Write a variant for each kind of role that needs a different argument.
5. **Review** with fresh eyes ([review](references/review.md)): a reader who did not write it, given only the built file and the target, reads it as a skeptical hiring manager, a parser, and an AI screener. Answer each doubt from the facts or by asking the person; rebuild.
6. **Settle with the person**: show it in a few themes (`./resumes themes preview --person <slug> --variant <name>`), go through every `confirm` phrase, and write each variant's guide from the research (the resumes reference, "Writing and refreshing a guide").

The resume is ready when the person has read and approved each variant, the variants use no unconfirmed phrase, the build reports nothing below the floor that the person has not chosen to keep, and the reviewer's doubts are answered from the facts. The job-application skill can then apply with it.
