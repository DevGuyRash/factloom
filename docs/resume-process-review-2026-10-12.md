# Resume creation process review — 2026-10-12

## Scope and ownership

This review changes factloom's agent guidance and guide template. Those are engine-owned; private consumer copies receive them through `./resumes update`. It changes no person's facts, active resume, application permissions, or historical submissions. The process still requires truthful claims and approval before a resume is sent.

## Findings and corrections

1. **Research was measured by volume.** Both research entry points prescribed “twenty or more” postings, even for sibling variants. They now share decision-led research: unique employers, relevant target coverage, required/preferred distinctions, explicit uncertainty, and a requirement-to-evidence comparison. Stop when additional relevant sources stop changing the recommendation. This is a design choice, not a statistically validated sample-size rule.
2. **Screening behavior was overstated.** Writing guidance asserted a universal sequence of readers, that software rarely rejects, that an unreadable resume is never found, and that current screening detects and drops keyword stuffing. These claims were removed. Official system-specific documentation distinguishes parsing, assistive matching, and human decisions; it does not justify a universal screening model.
3. **Verification was narrower than the instructions claimed.** Inspection of `tools/src/render/floor.ts` shows selected-content checks in one readable format, preferring PDF. It does not validate every field in both formats or an employer's parser. The process now checks full extraction and rendered pages of each delivered format, reports unavailable checks, and verifies portal fields only during an authorized application.
4. **Review could manufacture endless work.** “Argue for rejecting it,” asking whenever a bullet lacks an outcome, and repeating review after any substantive edit had no materiality boundary. Reviews now identify a passage, consequence, evidence, and correction; distinguish blockers from taste; accept concrete work without invented metrics; recheck affected areas; and stop when no fixable material defect remains.
5. **Intake could repeat settled questions.** It requested every source and reopened every disagreement or single-version claim. Intake now reads existing evidence and confirmations first, resolves only material remaining conflicts, and drafts the supported parts while unknowns wait. Repeated copies of a claim are not independent corroboration.
6. **Audience differences needed a concrete method.** Variants now select proof for distinct hiring arguments. Technical implementation, customer discovery, demonstrations, enablement, adoption, operations, and commercial work stay available where supported. Skills and recognizable keywords remain useful; a lexical score cannot substitute for relevance. Business purpose, production use, personal ownership, and measured business results stay separate.
7. **Approval coverage needed an explicit path.** `confirm` applies to bullet phrases, while headlines, skills, titles, and summaries can also make claims. The guide's existing manual review mechanism now explicitly holds those uncertainties and pending approval. A generated `ready` status is not factual or editorial validation.

## Primary-source checks

Sources were opened on 2026-10-12. These examples informed corrections; they are not a market-wide sample or evidence of interview outcomes.

- [Amazon recruiter guidance](https://www.aboutamazon.com/news/workplace/amazon-job-application-resume-writing-tips) favors clear, role-aligned accomplishments and measurable impact where available. It supports retaining evidence and readable simplicity without demanding a number for every bullet.
- [Greenhouse parsing documentation](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) documents partial or failed extraction, including formatting problems. It supports file and field review, not an ATS guarantee from a theme label.
- [Greenhouse Talent Matching](https://support.greenhouse.io/hc/en-us/articles/41396009937307-Talent-Matching) describes an assistive tool and says it does not automatically advance or reject candidates. This is evidence about that feature, not every employer or screening tool.
- OpenAI's [Applied AI Engineer](https://openai.com/careers/applied-ai-engineer-api-platform-digital-natives-san-francisco/) and [Applied AI Architect](https://openai.com/careers/applied-ai-architect-enterprise-san-francisco/) postings combine technical depth with customer adoption and business outcomes, but differ in hands-on delivery and technical account ownership. They illustrate why adjacent titles can need different evidence emphasis. Neither posting establishes an applicant's qualifications.
- [Anthropic's hiring guidance](https://www.anthropic.com/careers) explicitly values relevant independent work and gives distinct technical and nontechnical expectations. It supports keeping distinctive, relevant proof rather than forcing every candidate into a generic employment-only narrative.

A searched historical OpenAI solutions-engineer URL redirected to the careers index. It was not treated as a current vacancy; the current postings above were followed from the employer's index.

## Recursive review

A second pass checked the revised instructions against the existing commands. It found that `--out` leaves guides unchanged, so an existing guide could still look ready while its source is being revised. The correction lives at the writing step: add a manual pending-approval item to every affected guide before source edits. The existing `--no-build` option also avoids rendering an all-facts starter before selecting content. Research, intake, builder, reconciliation, the guide template, and README now describe compatible behavior.

Focused walkthroughs covered: a single target posting; sibling roles needing different proof; a stale or redirected posting; missing metrics; a commercial tool without revenue attribution; conflicting old resumes with a recorded confirmation; a changed shared fact; a non-bullet uncertainty; a PDF/Word extraction discrepancy; unavailable conversion; and a reviewer proposing only a taste change. These were editorial consistency checks, not repeated model trials.

## Verification and limits

- `git diff --check`, engine `./resumes check`, and demo `RESUMES_ROOT=examples/demo ./resumes check` passed.
- The existing fictional demo built locally to a separate output directory as DOCX and PDF. Both text extractions were read; the one-page PDF was rendered and visually inspected. No active demo or personal resume was changed.
- In a temporary fictional consumer, `variant new --from data-analyst --no-build` created the revised guide; `build-resumes --out` preserved it byte-for-byte; a normal build preserved its manual approval item and `needs-review` status.
- No runtime code, dependencies, test framework, or automated evaluation suite was added. Broad unit/integration suites, typecheck, hosted CI, actual employer uploads, and hiring-outcome experiments were not run for these instruction/template edits.
- The revised agent behavior is **untested in repeated before/after trials**. The checks establish instruction consistency and compatibility with the existing local workflow, not higher interview rates, employer ATS acceptance, or measured model-behavior improvement.

## Adoption

Merge the engine PR after review. A private consumer then uses its normal `./resumes update` path in a clean integration checkout, reviews the engine-only diff, and retains all private facts, active files, and application settings. A dirty consumer is not a place to overwrite engine files by hand. Updating the process does not rebuild personal resumes or resume applications.
