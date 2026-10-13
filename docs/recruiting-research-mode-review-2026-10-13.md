# Recruiting research mode review — 2026-10-13

## Scope and design

The user explicitly requested realistic synthetic resumes for companies that have agreed to recruiting-system tests. The new [research-mode reference](../.agents/skills/resume-builder/references/research-mode.md) supports supplied-content baselines, mixed supplied/generated versions, and wholly generated candidates. Fictional responsibilities, qualifications, accomplishments, and precise metrics are allowed within that scope. Genuine career work retains its factual standards.

The creation and tracking machinery is unchanged: existing person records, facts, variants, themes, active/archive folders, guide prose, review flags, rendering, and application records are reused. Research scope is declared internally; genuine baselines are preserved rather than overwritten. No parallel test-version layout is required. The scoped rule appears in AGENTS.md and skill entry points so linked factual-person guidance does not accidentally prevent intentional fiction. Research provenance stays outside blinded artifacts, including their filenames and exposed metadata; existing `generated` frontmatter remains a build flag. Preparation does not authorize uploads or submissions.

A versioned `research-controls` YAML template supplies enabled-by-default research features and dials, with batch inheritance and explicit variant/tailored overrides. Evidence-only at any applicable level wins over all generation settings, including generated facts already present in reused material. Guides/application notes retain effective settings for each output. These are executor-interpreted instructions, not compiler or renderer enforcement; commands and statuses are unchanged.

Page-limit onboarding offers a positive integer or executor judgment, with a context-based recommendation and reuse across the batch. The saved dial maps to the existing `pages` field; a stricter employer limit wins with an explanation. There is no new pagination mechanism or universal one-page default.

The executor translates conversational preferences into settings and safely replaces selected active outputs after review, retaining superseded artifacts in the existing archive and keeping explicitly retained active siblings. A wholly generated candidate without supported source material cannot become evidence-only by relabeling; that transition remains pending rather than producing a blank replacement.

Research precedes drafting and is revisited when review reveals a material gap. The requested 10–50 distinct-posting range is a coverage aim where relevant sources are available, not evidence of representativeness or a reason to invent sources. Adaptive searches also use job-holder accounts, hiring stories, interviewer explanations, and relevant communities, with anecdotes and claimed causes distinguished from employer criteria and established findings. Research must change a content, emphasis, or evaluation decision.

The evaluation guidance distinguishes parser extraction, selection/ranking, and human detectability. It preserves a baseline, controlled comparisons, held-out feedback boundaries, appropriate blinding, real observation records, and stopping conditions. “Perfect” is an optimization goal under explicit criteria, not a promised hiring outcome. No external test or application was run as part of these instruction changes.

## Primary-source checks

Opened on 2026-10-13; these sources support evaluation cautions, not proof that a particular synthetic resume will succeed.

- [Greenhouse, Unsuccessful resume parse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse): poorly designed placeholder names, employers, and titles can lead to omitted fields. This motivates realistic fixtures and actual field-level checks, while keeping local extraction separate from target-system behavior.
- [NIST AI RMF Core, MEASURE](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/): calls for documented test sets, metrics, tools, deployment-relevant conditions, appropriate human evaluation, and generalization limits. This informs scoped criteria and traceable observations; the workflow makes no claim of compliance or comprehensive system validation.
- [Anthropic, A statistical approach to model evaluations](https://www.anthropic.com/research/statistical-approach-to-model-evals): explains paired comparisons, repeated responses, dependence among related cases, and uncertainty. This informs separate case/attempt counts and avoids treating repeat calls as independent evidence.
- [Zheng et al., Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685): identifies position, verbosity, and self-enhancement biases in model judges. This motivates neutral framing, order checks, and validation against human-reviewed outputs; its benchmark results are not evidence about recruiters.

## Review and verification

An independent read-only review informed the separation of evaluation outcomes, profile-versus-layout comparisons, control cases for detectability, and handling of repeated observations. Manual consistency cases cover ordinary genuine resumes, wholly synthetic and mixed candidates, missing context, scarce postings, source-inspired questions, blinded artifacts, unapproved delivery, held-out feedback reuse, and all-synthetic detection studies. These are editorial checks, not behavioral trials.

After renewed authorization, the interrupted local verification call was retried and completed: engine/demo checks reported zero errors and warnings; typecheck passed; the existing suite finished with 244 passed, 4 skipped, and 0 failed. The new controls template rendered through the existing `template research-controls.yaml` command and parsed as valid YAML with 11 enabled feature defaults. The guide template rendered with its existing review state. Changed-document relative links (62), skill metadata, and whitespace checks passed.

Additional manual control cases covered inherited defaults, explicit variant and tailored overrides, evidence-only winning over a later false value, all generation switches disabled, filtering earlier generated claims, retained active siblings, and the no-evidence transition. These check documented meaning only; they are not automated enforcement or agent-behavior tests.

The new instructions remain **untested in repeated before/after agent trials**. No new runtime, schema, dependency, test framework, hosted CI run, private applicant change, or real recruiting-system evaluation is part of this documentation revision.
