# Reviewing the draft

Review the built deliverables, not just their source. When a fresh reader is available, give them the resume, the actual target posting or a sourced role brief, and the review below, without the writer's rationale. First judge what the page communicates; then use the facts and evidence to verify concerns. Otherwise make a separate cold pass yourself and disclose that the review was not independent. This is an editorial review, not a prediction of employer decisions.

## What the page demonstrates

1. **Hiring argument.** Identify the role and level the page supports, its strongest evidence, and the first substantive screening question. Compare with the intended target; name a gap only when it could affect that reader's judgment.
2. **Requirement coverage.** Map important required and preferred criteria to explicit resume evidence. Separate visible strengths, buried evidence, transferable experience, unsupported requirements, and genuine fit constraints. A gap can be real without requiring a rewrite or a question to the person.
3. **Contribution and value.** Check the person's share, concrete work, users, and result. Preserve technical, customer-facing, operational, and go-to-market strengths relevant to this target. A specific deliverable can stand without a metric; measured outcomes, intended benefits, and team results remain distinct.
4. **Defensibility.** Verify titles, employers, dates, credentials, numbers, and ownership against the recorded sources. Projects must read as projects. If a public profile differs, resolve the discrepancy from evidence rather than silently changing the resume to match it.
5. **Selection and voice.** Keep distinctive proof and supported search terms; remove repetition and vague claims rather than all technical detail or the skills section. The first part of the page should make sense to its audience. Sibling variants should have different evidence priorities where the targets differ.

For every proposed change, identify the passage, reader consequence, evidence, and smallest useful correction. Separate factual or delivery blockers, material improvements, and optional taste. A request to be skeptical is not a requirement to find a flaw. A second model's summary can expose ambiguity; its score or preference does not establish actual ATS behavior, factual truth, or a rejection cause.

## Inspect the files

- Run `./resumes text <file>` for each format being delivered. Read the full extraction, not just the command's exit status: contact details, headings, employer/title/date relationships, projects versus employment, skills, and bullet order must remain clear. The build's automatic check covers selected content from one readable format; it does not validate every field or every employer's parser.
- View the rendered pages at normal size. Check clipping, awkward page breaks, stranded headings, density, readable type, links, and the strongest evidence's placement. PDF and Word pagination can differ. If a viewer or converter is unavailable, say which file or check remains unverified.
- Follow the actual portal's format and size requirements. Verify autofilled fields during an authorized application when possible; local text extraction alone is not end-to-end ATS validation. Do not upload a private resume to a third-party scoring site just to simulate this check.

## Resolve and stop

Fix substantiated defects from the facts. Ask only for material unknowns the existing records cannot resolve; group them with proposed wording. Keep held claims in `confirm` or the guide's manual `review` and continue the supported work. Fix unreadable or missing output rather than treating it as an optional preference.

Rebuild after edits and recheck affected facts, sections, and final files, including regressions such as lost skills, changed ownership, or a new page break. Another full review is warranted when the argument, facts, or layout changed materially; an isolated wording edit needs a focused check. Keep each concern resolved, held for specific evidence, or declined with a reason. Stop when there are no unresolved material defects that can be fixed from available evidence. Do not reopen settled taste choices without new evidence or the person's request.

Deliver the strongest verified draft even when optional improvements or factual questions remain, clearly labeled for review. A sendable variant also requires the person's approval, no unresolved claims or manual review items, and successful file checks. Build the approved version into active, recheck those final files, and run `./resumes check`. A generated `ready` status alone does not establish editorial approval or authorize applications.
