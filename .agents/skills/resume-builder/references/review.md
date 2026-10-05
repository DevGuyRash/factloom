# Reviewing the draft

The writer is the worst judge of a draft: models in particular rate their own work kindly. Review the built file, not the YAML, with a reader who did not write it: when the host offers subagents, give one only the built resume's text, the target role and level, and these passes, and ask for doubts rather than a grade; otherwise read the built file cold yourself, as if someone else wrote it.

## Reading as the people who will read it

1. **The reader's summary.** State the target role and level this resume argues for, its three strongest pieces of evidence, and the first question a phone screen would ask. Where that differs from what the person wants a reader to conclude, the page is failing to say something.
2. **The skeptical hiring manager.** Argue for rejecting it. Answer each doubt from the facts, or put it to the person; never invent to close it.
3. **So what?** For each bullet: what changed, for whom, and why it mattered. When the facts do not say, ask.
4. **The swap test.** Could the bullet appear unchanged on a peer's resume? A strong one names a concrete object, scale, constraint, or consequence that belongs to this person.
5. **Defensibility and level.** Could the person talk about each bullet for half a minute and take a follow-up question? Do the numbers fit the role, and does the scope grow from one role to the next as the facts say it did?
6. **Voice.** Plain and specific, in the person's register. Look first at structure (every bullet built the same way, triads, inflated significance, "not just X but Y" contrasts), then at words, and rewrite a sentence around its point rather than swapping one stock word for another.
7. **Keyword honesty.** Posting terms appear where the facts support them, in the person's sentences, never as a list copied from postings or hidden text.
8. **Consistency.** Every title, date, employer, number, and credential traces to `facts.yaml` and `evidence.md`, agrees with the profile and the person's public profiles (screeners compare them), and the verbs claim no more ownership than the person had.

## Reading as the machines that will read it

- **The parser.** Read the PDF's text layer in the order software gets it (for example `pdftotext -layout <file.pdf> -`): name and contact first and intact, headings recognizable, dates next to their roles, nothing important only in a header, footer, or graphic. Check the Word file the same way when one is sent.
- **The AI screener.** Summarize the resume against a real posting for the target role as a screening model would: what it concludes about fit, level, and gaps. Where it misses a strength the facts support, the wording or placement is hiding it.

## Then

- Fix from the facts, or ask the person; record new answers in `facts.yaml` and `evidence.md` with their source.
- Rebuild; `./resumes build-resumes` reports anything below the floor (a role with too few bullets, a fragment or a wall of text, a repeat, an empty section, a job without dates, placeholder text, a line the built file's text does not give back). The floor is a minimum, never a target.
- Review again when the changes were more than wording.
