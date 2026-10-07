---
name: resume-reconciliation
description: Reconcile rejected job applications and employer feedback with the actual roles, submitted materials, and verified experience, then improve existing resume variants and any expressly requested career profiles. Use for evidence-led resume improvement after applications; not for starting an application campaign.
---

# Resume reconciliation

Turn application outcomes into better-supported, role-specific resumes. A rejection establishes an outcome, not its cause. Separate what an employer said, what a requirement-to-experience comparison shows, and what remains a hypothesis. The person's current request governs the work and its destinations; this skill grants no authority to apply, send messages, publish changes, or start recurring work.

## Establish the evidence set

Identify the person, the exact existing variants, their source files and intended roles, and the private repository that owns them. Verify repository ownership, visibility, branch, and other writers before editing. In Factloom, personal facts and correspondence belong in the person's private copy; upstream examples use the fictional demo person. Read applicable repository instructions and the person's profile, evidence, active guides, and application records. Preserve existing factual and audience constraints.

Define a finite review with a cutoff, mailboxes or sources, search terms, and pagination end. Use authorized mail access and its supported commands; preserve message state where the interface supports it. Search both dispositions and application receipts, inspect the message bodies, and follow later replies. Record exclusions and inaccessible sources so the ledger describes its coverage honestly. Silence and automated acknowledgments remain pending evidence, not rejections.

Keep one application identity per employer, role, requisition or posting URL, and application period. Group related messages chronologically; distinguish candidate rejection, role closure, withdrawal, an eligibility restriction, and later progression. A later message about another role does not replace this outcome. Retain a durable message identifier and date rather than relying on an inbox position. The [ledger reference](references/ledger.md) gives the fields and evidence distinctions.

Identify the submitted resume from the application's record, upload receipt, retained attachment, or artifact hash. Record the confidence: exact artifact, recorded variant only, or unknown. A current resume, reused filename, or submission date alone does not establish what was sent. Preserve historical submissions while revising current sources.

## Investigate and decide

Read the actual posting captured for the application, then check its employer or ATS page and the company's own material where available. Keep the capture and current page dates separate. A different opening or a current replacement can be a market benchmark, not the historical job specification. Resolve recruiter versus employer and role level rather than inferring them from a title alone.

Compare the role's concrete work, required qualifications, preferred experience, engagement terms, and eligibility constraints against verified experience and the submitted material. Classify each proposed change:

- **Visibility gap:** existing evidence is absent, buried, ambiguous, or described in unfamiliar terms. Improve wording, ordering, or selection with the same factual scope.
- **Evidence gap:** the requirement is not supported. Hold that claim individually and name the missing evidence; continue the supported improvements.
- **Fit constraint:** location, work authorization, contract type, schedule, travel, pay, or seniority conflicts with the person's requirements or documented background. Record it without trying to repair it through keywords.
- **Hypothesis:** a plausible explanation, such as length or emphasis, that the available evidence does not establish. Test its usefulness as an editorial choice without reporting it as the rejection's cause.

Go-to-market language must name the demonstrated work. Building onboarding, lead qualification, pricing controls, payment integration, or adoption materials can support go-to-market engineering. It does not establish a product launch, commercial strategy ownership, partnerships, sales wins, revenue growth, or measured conversion impact. Keep prototypes, self-directed projects, production deployments, individual contribution, user estimates, and measured outcomes distinguishable.

## Revise and verify

Maintain each variant's intended argument. Choose the evidence and level of technical detail for that audience rather than adding every posting term to every resume. Every factual addition needs a source and applicable dates; rephrasing preserves its scope. Keep unresolved claims out of deliverable artifacts. Use the person's established writing and design preferences.

For generated resumes, edit `resumes/source/facts.yaml` and the variant definitions, then rebuild with the repository's supported commands. Preserve existing bullet references used by historical tailored variants. Record the source-to-change mapping in the private evidence and reconciliation notes. Keep work by other writers intact and retain originals through normal version history.

Before any requested publication, inspect the final exported PDF and Word text and every rendered page. Verify readable ordering, complete sections, contact information, dates, titles, metrics, links, and consistency with the sources. Check that projects are recognizable as projects and that a parser would not turn them into employment. Run the repository's required validation; resolve issues introduced by the revision. An export existing on disk is not evidence that its layout or text survived.

For expressly requested profile or upload changes, confirm the signed-in account, exact profile, intended audience, visibility, and file identity. Prepare supported wording first, then use the site's supported interface. Re-read saved content and verify the uploaded variant and version afterward. Keep application submissions, messages, subscriptions, credentials, security permissions, and visibility changes outside this workflow unless separately requested. When access needs the person, preserve the finished artifacts and name the specific handoff.

Finish with the covered cohort, supported improvements and sources, remaining evidence gaps, QA results, and exact verified destinations. Distinguish prepared artifacts from applied source changes and verified live updates. Report a blocker only for the work it actually prevents.
