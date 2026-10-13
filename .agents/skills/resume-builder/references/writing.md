# Writing the resume

Write the strongest truthful case for the target's actual work. Use the research-to-evidence comparison to choose what leads, what to retain for searchability, and what this variant can omit. Explain consequential choices briefly; the person should review a useful draft, not make every editorial decision.

## Readers and length

Recruiters, hiring managers, parsers, search filters, and sometimes matching or screening models may see different versions of the material. Their behavior depends on the employer and system; a simulated AI review cannot predict a decision. Make the first part of the page communicate the target, level, and strongest proof, with readable evidence and accurate chronology throughout.

Use the space the relevant evidence needs. One page often suits a short record; a second can serve substantial relevant experience. Follow the actual employer's length and file requirements, and check current official guidance for a regulated or market-specific format. Select and shorten lower-value content before squeezing type and margins. The renderer's 9 pt floor is a mechanical limit, not a readability goal.

Use reverse chronology within experience, or a clear hybrid when relevant projects or earlier experience need prominence. Preserve dated roles and distinguish projects from employment. Set `pages` when a page limit is warranted; inspect the fitted output at normal reading size.

## Sections and variant boundaries

Use recognizable headings and text contact details in the document body: name, city or region, email, phone, and relevant authorized links. A headline describes the target argument without inventing an official title or seniority. Use a summary when it adds a specific combination of strengths or explains a transition; support it in the evidence. Choose experience, projects, skills, education, credentials, and other sections according to the target.

Retain a concise skills section for relevant, supported skills, including recognizable names and abbreviations recruiters might search. Put the most important skills in context in experience or projects too; every item need not have its own bullet. Preserve the broader verified inventory in `facts.yaml` when trimming a variant.

Keep official employment titles, dates, and employment type intact. A reviewed functional descriptor can clarify an unfamiliar title without replacing it. Group contracts only when employers, clients, and dates remain intelligible and disclosure is permitted. Include gaps or personal context only when useful and chosen by the person; a complete resume does not require private explanations. Leave out unnecessary sensitive details.

Variants should make meaningfully different cases from the same facts. A teaching variant might emphasize instruction and learner progress; a skilled-trade variant might emphasize workmanship and safe practice; an administrative variant might emphasize coordination and accuracy. These are illustrative, not required categories: use this person’s actual target and evidence. Choose the mix from actual target requirements. If the argument and strongest evidence stay the same, reuse the variant and tailor it instead of creating another near-duplicate.

## Contributions and relevant value

A bullet should show a specific contribution and why it mattered: an object, decision, constraint, scale, deliverable, or consequence that belongs to this person. Use ordinary verbs and one main idea, usually in one or two readable lines. Vary the structure naturally rather than forcing every sentence into the same formula.

Connect the work to the people, organization, service, or purpose it supported. Preserve the forms of contribution relevant to that profession, including routine responsibilities whose scope, reliability, skill, or judgment provides strong evidence. Distinguish what was intended, what was delivered, what was used, and what was measured. Contributing to a team result does not establish sole ownership; completing training does not establish professional practice. Qualitative outcomes, concrete capabilities, and scope are useful when reliable numbers do not exist. Metrics need their units, period, baseline where relevant, attribution, and source; avoid implying causal gains from an estimate or team result.

Keep wording defensible in a follow-up conversation. Research can supply familiar language for a true claim, not missing experience. Name equivalent tools for what they actually are. Use supported keywords in readable context and in the skills section; term coverage is a diagnostic, not a target to maximize. Hidden text, copied unsupported requirements, and instructions to screening software have no place in the resume.

## Source edits and local delivery

Change `facts.yaml` or the variant, never generated files. Keep source links in `evidence.md`. Preserve approved factual scope through grammar, clarity, shortening, or reordering. Verify and, where not already approved, confirm a new or changed title, date, qualification, number, ownership, scope, deployment status, outcome, or substantive implication. Put the unresolved exact phrase in its bullet's `confirm`; non-bullet uncertainties belong in the guide's manual `review`. A request for exact-wording approval still governs. Append bullets and reword in place: variants and historical tailored specs refer to bullet indexes.

Before introducing unresolved claims, inspect which variants actually select the changed bullets or fields. Add a specific manual `review` item and set `status: needs-review` only on those guides, or when a new intended use or an explicit review request needs approval. A shared file edit alone does not invalidate an unchanged sibling; purely editorial revisions retain existing approval. Build review copies with `./resumes build-resumes --person <slug> --variant <name> --out <review-dir>`; this preserves active files but does not regenerate guide flags. Keep the established theme unless layout needs a change. For portals, an `ats: safe` flow theme is a starting point, not certification by an employer's parser.

Follow the destination's file type and size rules; otherwise provide a text-based PDF when available and the editable Word file. Local extraction checks only some content in a readable output, not every format or employer's field mapping. Inspect each deliverable's text and rendered pages as [review](review.md) describes. If PDF rendering or extraction is unavailable, deliver what was verified, name the missing check, and keep the unavailable format pending. Give the person the files, what each variant is for, and any exact claims needing their confirmation.
