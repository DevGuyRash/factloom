---
name: resume-reconciliation
description: Reconcile rejected job applications and employer feedback with the actual roles, submitted materials, and verified experience, then improve existing resume variants and any expressly requested career profiles. Use for evidence-led resume improvement after applications; not for starting an application campaign.
---

# Resume reconciliation

Turn application outcomes into better-supported, role-specific resumes. A rejection establishes an outcome, not its cause. Keep three things apart: what an employer said, what a comparison of the role's requirements with the person's experience shows, and what remains a hypothesis. This review changes the person's resume sources and notes; applying, sending messages, and publishing stay with the job-application skill and the person's request. Save coherent changes under the shared [checkpoint policy](../../../AGENTS.md#local-checkpoints-in-consumer-work).

For company-authorized synthetic tests, use the builder's [research mode](../resume-builder/references/research-mode.md). Review the exact tested artifact and actual responses against its stated criteria; synthetic career content is evaluated for design fit and consistency rather than real-world truth. Keep research candidates and outcomes separate from genuine career records. A test response establishes neither real hiring success nor a general cause, and revisions or additional submissions stay within the authorized test scope. The factual-person workflow below otherwise applies.

## Establish the evidence set

Start from the repository, which already holds most of it (AGENTS.md says where things live): each application's record (status, the outcome recorded with `./resumes outcome`, dated notes, the `resume:` variant, answers given), its posting snapshot, and the resume built for it (`resume-tailored.yaml` and its PDF in the application directory, or the variant named in the record). `./resumes stats` shows responses by variant, source, and site. Read the person's profile, evidence, and active guides, and keep their existing factual and audience constraints.

Define a finite review: the applications in scope and a cutoff date. Fill gaps from mail only where the records lack an outcome, under the person's mail grants and with the job-application skill's mail rules; record each outcome found with `./resumes outcome`. Silence and automated acknowledgments remain pending, not rejections. Note what could not be reached, so the review describes its coverage honestly.

Keep one identity per application: employer, recruiter when distinct, role, requisition or posting link, and period. Order its messages by date, and tell apart a rejection of the candidate, a role filled, paused, or closed, a withdrawal, an eligibility restriction, and later progress; a later message about another role does not replace this outcome. The [ledger reference](references/ledger.md) gives the fields and evidence distinctions, and where the ledger lives.

Identify what was sent with its confidence: exact retained artifact and supporting delivery record, recorded variant only, or unknown. Preserve its factual or explicitly synthetic identity and source/settings revision where recorded; later source changes do not change the sent version. A current resume, reused filename, or submission date alone does not establish what was sent.

## Investigate and decide

Read the historical posting and feedback for the application. Consult current official employer material when it could resolve a role, responsibility, fit, or terminology question; keep dates apart because a current opening is not the historical job. Distinguish required and preferred criteria and recruiter from employer. Employer values establish no candidate beliefs or experience.

Compare the role's actual work, required and preferred qualifications, engagement terms, and eligibility with the person's verified experience and what was sent. Classify each proposed change:

- **Visibility gap:** source evidence exists but the sent artifact omits, buries, or obscures it. Follow specific feedback back to the original evidence and relevant user corrections, recover supported detail, and make the narrowest useful source or selection edit. Name transferable tools or methods for what they are.
- **Evidence gap:** the requirement is not supported. Hold that claim and name the evidence that would support it; continue the supported improvements.
- **Fit constraint:** location, work authorization, engagement, schedule, travel, pay, or seniority conflicts with the person's requirements or background. Record it; keywords cannot repair it, and a pattern of them belongs in the person's answers or searches.
- **Hypothesis:** a plausible explanation the evidence does not establish, such as length or emphasis. Generic rejection language leaves the cause unknown and can justify no change. Try an editorial hypothesis only when the role/evidence comparison supports it, without reporting it as the rejection's cause.

Work that serves a business function (sales, marketing, finance, operations) supports describing that work; it does not establish ownership of the function's results (a launch, strategy, partnerships, wins, revenue, or measured conversion) without a source. Keep prototypes, self-directed projects, production deployments, individual contribution, estimates, and measured outcomes distinguishable; an outcome without a measurement can still say who used the work and what changed for them.

## Revise and verify

Keep each variant's argument and compare the original evidence, purpose, and dated user corrections with what was sent and the proposed revision. Change the narrowest responsible source or selection, preserving irrelevant detail in the reusable record and explaining material omissions in the guide. Every factual addition needs a source and dates in `evidence.md`; editorial rewording preserves approved scope. Unresolved changed meaning goes in bullet `confirm` or manual guide `review`; hold only affected variants. Append additions and reword referenced bullets in place, because variants and historical tailored specs use their indexes. Preserve sent artifacts instead of regenerating them from today's facts.

Follow the builder’s [build and file review](../resume-builder/references/review.md): preserve active files with `--out` while substantive approval is pending; approved changes can build directly into active. Verify each delivered format’s extraction, layout, factual scope, and audience fit, and preserve supported skills. The mechanical floor is not parser validation. Keep unresolved non-bullet claims and pending approval in manual `review`; reuse a verified active build rather than repeating it. Required repository checks still apply.

For an expressly requested change to a career profile or a site's saved resume, confirm the signed-in account, the profile, its audience and visibility, and the file; prepare supported wording first, make the change through the site's own interface, and read it back afterwards. Sign-ins and account steps follow the job-application skill's forms rules.

The review is done when every application in scope has its outcome and comparison in the ledger, supported changes are in the sources and rebuilt, material defects are resolved, held claims name the evidence they need, and the person has the reviewed files and what they must confirm. A draft may remain held for approval; optional preferences do not start another quality loop. Resume approval leaves application permissions and pauses unchanged.
