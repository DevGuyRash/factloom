---
name: resume-reconciliation
description: Reconcile rejected job applications and employer feedback with the actual roles, submitted materials, and verified experience, then improve existing resume variants and any expressly requested career profiles. Use for evidence-led resume improvement after applications; not for starting an application campaign.
---

# Resume reconciliation

Turn application outcomes into better-supported, role-specific resumes. A rejection establishes an outcome, not its cause. Keep three things apart: what an employer said, what a comparison of the role's requirements with the person's experience shows, and what remains a hypothesis. This review changes the person's resume sources and notes; applying, sending messages, and publishing stay with the job-application skill and the person's request. Follow [local checkpoints](../../../AGENTS.md#local-checkpoints-in-consumer-work): inspect Git state first, then commit coherent outcome reconciliation and reviewed resume changes locally, including at handoff.

For company-authorized synthetic tests, use the builder's [research mode](../resume-builder/references/research-mode.md). Review the exact tested artifact and actual responses against its stated criteria; synthetic career content is evaluated for design fit and consistency rather than real-world truth. Keep research candidates and outcomes separate from genuine career records. A test response establishes neither real hiring success nor a general cause, and revisions or additional submissions stay within the authorized test scope. The factual-person workflow below otherwise applies.

## Establish the evidence set

Start from the repository, which already holds most of it (AGENTS.md says where things live): each application's record (status, the outcome recorded with `./resumes outcome`, dated notes, the `resume:` variant, answers given), its posting snapshot, and the resume built for it (`resume-tailored.yaml` and its PDF in the application directory, or the variant named in the record). `./resumes stats` shows responses by variant, source, and site. Read the person's profile, evidence, and active guides, and keep their existing factual and audience constraints.

Define a finite review: the applications in scope and a cutoff date. Fill gaps from mail only where the records lack an outcome, under the person's mail grants and with the job-application skill's mail rules; record each outcome found with `./resumes outcome`. Silence and automated acknowledgments remain pending, not rejections. Note what could not be reached, so the review describes its coverage honestly.

Keep one identity per application: employer, recruiter when distinct, role, requisition or posting link, and period. Order its messages by date, and tell apart a rejection of the candidate, a role filled, paused, or closed, a withdrawal, an eligibility restriction, and later progress; a later message about another role does not replace this outcome. The [ledger reference](references/ledger.md) gives the fields and evidence distinctions, and where the ledger lives.

Identify what was sent with its confidence: the exact file (the tailored resume kept in the application directory), the recorded variant only, or unknown. A current resume, a reused file name, or a submission date alone does not establish what was sent.

## Investigate and decide

Read the posting as captured for the application, then the employer's current page and its own material where available, keeping their dates apart: a current opening can benchmark the market but is not the historical job. Resolve recruiter versus employer, and the role's level, rather than inferring them from a title.

Compare the role's actual work, required and preferred qualifications, engagement terms, and eligibility with the person's verified experience and what was sent. Classify each proposed change:

- **Visibility gap:** the evidence exists but is absent, buried, ambiguous, or described in unfamiliar terms. Improve wording, order, or selection within the same factual scope; a close equivalent the posting did not name (another platform, tool, or method) is named for what it is, with what carries over.
- **Evidence gap:** the requirement is not supported. Hold that claim and name the evidence that would support it; continue the supported improvements.
- **Fit constraint:** location, work authorization, engagement, schedule, travel, pay, or seniority conflicts with the person's requirements or background. Record it; keywords cannot repair it, and a pattern of them belongs in the person's answers or searches.
- **Hypothesis:** a plausible explanation the evidence does not establish, such as length or emphasis. Try it as an editorial choice without reporting it as the cause.

Work that serves a business function (sales, marketing, finance, operations) supports describing that work; it does not establish ownership of the function's results (a launch, strategy, partnerships, wins, revenue, or measured conversion) without a source. Keep prototypes, self-directed projects, production deployments, individual contribution, estimates, and measured outcomes distinguishable; an outcome without a measurement can still say who used the work and what changed for them.

## Revise and verify

Keep each variant's argument: choose the evidence and technical depth for its audience rather than adding every posting term. Edit `resumes/source/facts.yaml` and variants, never generated files. Every factual addition needs a source and dates in `evidence.md`; editorial rewording preserves already approved scope. Unresolved new or changed factual meaning goes in the bullet's `confirm` until approved. Hold only guides whose selected content or intended use needs confirmation, using manual `review` and `status: needs-review`; unused changed bullets do not hold siblings. Variants and historical tailored specs reference bullet positions, so append additions and reword in place rather than moving or deleting referenced bullets.

Build review copies with `./resumes build-resumes --person <slug> --variant <name> --out <review-dir>` while retaining approved active files. Follow the resume-builder skill's [review](../resume-builder/references/review.md): verify each delivered format's extraction and visual layout, factual scope, and audience fit. The mechanical floor checks selected content, not every parser field. Preserve supported skills and role-relevant strengths while tailoring. Keep unresolved non-bullet claims and pending approval in the guide's manual `review`. Rebuild approved active files, inspect the final outputs, and run `./resumes check`.

For an expressly requested change to a career profile or a site's saved resume, confirm the signed-in account, the profile, its audience and visibility, and the file; prepare supported wording first, make the change through the site's own interface, and read it back afterwards. Sign-ins and account steps follow the job-application skill's forms rules.

The review is done when every application in scope has its outcome and comparison in the ledger, supported changes are in the sources and rebuilt, material defects are resolved, held claims name the evidence they need, and the person has the reviewed files and what they must confirm. A draft may remain held for approval; optional preferences do not start another quality loop. Resume approval leaves application permissions and pauses unchanged.
