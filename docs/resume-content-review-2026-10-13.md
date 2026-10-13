# Resume content and evidence review — 2026-10-13

## Scope and findings

This is an engine-only revision to the resume-builder guidance, intake reference, and resume-guide template. It changes no person's records, application permissions, renderer, schema, or dependencies. It extends the [earlier process review](resume-process-review-2026-10-12.md) with content-quality checks before and after selection.

- **Preserved sources can still become thin outputs.** The reported conversion retained much of its original content in the import but omitted meaningful detail from presentation. Intake now makes the boundary explicit: preserve the complete usable, sanitized career text before tailoring, and briefly account for substantive detail in reusable facts or as retained context, uncertainty, duplication, or an explained exclusion. This uses the existing imported note, not another ledger. It addresses a capture risk without claiming that lost original bytes caused the reported problem.
- **Traceability and personal attribution needed separation.** A source can contain copied employer requirements or draft suggestions as well as personal claims. Intake identifies meaningful attribution ambiguity and verifies role/employer relationships. A duties heading in a supplied resume does not itself reopen accepted facts. Existing confirmations carry forward; a later role does not silently inherit an earlier employer. Research suggests questions, not personal achievements.
- **Compression needed an evidence check.** Rewriting retains meaningful duties, methods, settings, scope, and accountability. Selection is compared with the source record before final file extraction. The actual layout is inspected before cutting useful detail for space. The guide explains material omissions or combinations; grammar changes need no log.
- **Achievement-led writing needed a sparse-evidence path.** Lead with substantiated accomplishments, recover incidents and relevant measures, and use concrete responsibility or qualitative results where that is the evidence available. Suggested measures and unanswered placeholders stay in separate proposed wording or questions. Workload, quality, improvement, intended benefit, and measured result remain distinct.
- **A general summary needed its own purpose.** It can communicate a supported professional identity, breadth, and concrete transferable strengths without assuming a single vacancy. Exact-role and adjacent-role research inform emphasis and terminology while preserving the person's chosen direction. They do not require extra variants or an exhaustive market survey.

## Primary sources and decisions

Opened on 2026-10-13. These are guidance and occupational resources, not evidence of hiring outcomes or a universal resume formula.

- [Clark College Career Services, Master Resume](https://www.clark.edu/enroll/careers/documents/MasterResume.pdf): the worksheet, dated 2013, separates a comprehensive skills/experience record from the information selected for an application. This supports preserving detail before tailoring. Its inclusion of license numbers is not adopted; repository privacy rules still govern.
- [Harvard Mignone Center, Creating a Strong Resume](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/): recommends specific, active, factual writing, authentic representation, audience relevance, and checking converted layout. This supports retaining distinctive evidence through a rewrite. Its college-specific conventions are not universal requirements.
- [Berkeley Career Engagement, Resumes](https://www.career.berkeley.edu/prepare-for-success/resumes/): relates required/preferred criteria to relevant accomplishments and transferable skills, including experience outside the immediate field. Quantification is conditional on availability. This informs achievement elicitation and evidence selection, not invented figures or mandatory numbers per bullet.
- [American Chemical Society, Resume: An Introduction](https://www.acs.org/careers/career-services/career-pathways/industry/resume.html): says summary claims should have support later in the resume. That grounding principle informs broad professional summaries; its chemistry examples, personal-data advice, and branding claims are not adopted as general rules.
- [O*NET, Related Occupations](https://www.onetcenter.org/dictionary/31.0/mssql/related_occupations.html): relates occupations by work performed, knowledge, and titles. This supports investigating adjacent work rather than equating titles. Occupational similarity establishes neither an applicant's competence nor an employer's specific requirements; use the appropriate geography and actual posting.

The capture reconciliation, source-attribution boundary, and material-omission explanation are design choices informed by the observed failure modes. These sources do not empirically validate those mechanisms. CareerOneStop pages were inaccessible during this pass and were not used as fresh verification.

## Bounded consistency walkthroughs

These are manual editorial checks of the revised instructions, not repeated comparative agent trials or a new test framework.

| Fictional case | Required path in the revised guidance |
| --- | --- |
| A source has twelve distinct duties; a general draft has room but selects three | Preserve all usable source detail, map substantive groups to facts/context, restore useful accidental losses, and explain deliberate selection in the guide. |
| A record mixes personal history with a copied vacancy description | Preserve the text and its nature; clarify materially ambiguous attribution for selected claims. An ordinary duties heading in an accepted resume does not trigger blanket reapproval. |
| A new title arrives without employer or location | Keep those fields unknown rather than copying them from the previous job. |
| A service coordinator reports calls, visits, and parts records but no result | Write concrete scope now; ask for a useful incident or measure separately. The writing reference gives a grounded responsibility example and a conditional qualitative achievement. |
| Research suggests turnaround time or error reduction | Propose a relevant measure/question; the person or records must establish the number, period, baseline, and attribution before use. |
| A skilled worker has a specialty and broader supported work | A general summary retains professional breadth and concrete strengths; a targeted variant can emphasize the specialty without rewriting the person's identity. |
| A teacher considers training roles | Compare instruction-related transferable proof with the adjacent role's actual criteria; keep unheld credentials and unsupported duties as gaps. |
| A new theme drops a credential or summary phrase | Compare each delivered extraction with all selected content and inspect the layout; correct the source/rendering issue before delivery. |
| A shortened variant legitimately omits old detail | Keep the fuller evidence and facts portable, note the material reason in the guide, and preserve approved scope without repeated wording approval. |

## Verification and limits

- Engine `./resumes check` and demo `RESUMES_ROOT=examples/demo ./resumes check`: both passed with zero errors and warnings.
- `npm --prefix tools run typecheck`: passed. The existing local test suite completed with 244 passed, 4 skipped, 0 failed (248 total); no tests or framework were added.
- `git diff --check`, changed-document relative links (9), and skill frontmatter checks passed. Rendering the revised guide template for the fictional demo produced the new content-choice section, valid frontmatter, and the existing `needs-review` state with no unresolved template expressions.
- The patch changes eight instruction/template/report documents only. No resume-renderer change or personal resume rebuild was made; this pass does not claim fresh visual review of an applicant deliverable.

The revised agent behavior remains **untested in repeated before/after trials**. Documentation review and command compatibility cannot establish improved interview rates, actual employer parsing, or measured model behavior. No hosted CI or private applicant uploads are part of this revision.
