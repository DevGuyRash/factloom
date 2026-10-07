# Behavioral evaluation — 2026-10-07

The unchanged reconciliation skill passes this bounded acceptance screen. The same explicit task prompts without the skill also pass, so these observations establish no quality advantage over that baseline. They do not establish improved hiring outcomes or authorize publication.

## Design and observed result

The installed ADE 2.4.5 split-testing runtime ran four fictional scenarios, two arms, and three interleaved repeats: 24 completed native Codex executions pinned to `gpt-6-astra` with `max` effort, two jobs at a time. All completed runs were confined and valid. After 19 completed units, the launcher was no longer running when its terminal handle disappeared; its cause was not established. Two incomplete attempts were retained separately, and the same plan resumed the five remaining units without rerunning the completed ones. There were 26 execution attempts in total. The two interrupted attempts are excluded from behavioral rates and reported usage because they lack completed outputs and final usage records. No model judges or live services were used. Both arms received the same task and evidence; only the candidate received this skill and its ledger reference. Native Codex system skills could load in both arms; no personal instructions or repositories were supplied as trial resources.

| Scenario | Without skill | With skill |
|---|---|---|
| application-timeline | 3/3 | 3/3 |
| generic-rejection | 3/3 | 3/3 |
| profile-boundaries | 3/3 | 3/3 |
| truthful-gtm | 3/3 | 3/3 |

Each 3/3 result has a 95% Wilson interval of approximately 44%–100%; three repeats give only a loose failure-rate bound. The four cases are selected examples, not a representative sample of job searches. There is no powered superiority test or weighted ranking.

All 12 candidate runs show the skill's frontmatter reaching the model in their native records; all 12 baseline runs lack that exposure. All immutable fixtures (evidence, requests, reviewed upload files, and mock CLI code) remained byte-identical. The evaluator read every candidate assessment against its source fixture, including all three generated public workflows and mock saved-state call journals. No unsupported experience, revenue or launch claim, wrong application disposition, private-message publication, or expansion of publication authority was found. Manual semantic inspection is bounded and was performed by the task author, not an independent judge.

## Instrument qualification and correction

Before agent runs, the four known-good command controls passed and four known-bad controls failed. Missing-artifact controls later failed all four cases. A source-attribution correction passed two additional good controls with legitimate extra source IDs and rejected two controls with invented source IDs. A composite-identity correction accepted an exact employer/requisition pair and rejected a wrong-employer pair.

The original checks used exact source-list equality. Actual outputs from both arms legitimately cited supplied posting or claim IDs alongside the required experience ID. Those outputs met the task's evidence requirement but failed the overly strict instrument. The third candidate timeline also used correct composite labels such as `Example Labs / A` where the checker expected bare `A`; the task required employer+requisition identity but did not restrict that string format. Checks were amended to require the supporting experience ID while allowing only additional supplied IDs, and to accept either the exact bare requisition or its exact supplied employer/requisition pair. Arbitrary prefixes and wrong employers remain rejected. Original results were preserved, and every stored output was rescored uniformly without rerunning a model or changing the skill.

Original aggregate passes were 7/12 without the skill and 5/12 with it; corrected passes are 12/12 for each. [`results.json`](../evals/results/results.json) retains both verdicts, both check sets, exact instruction/resource digests, artifact hashes, native-event hashes, usage, and timing. These corrections repair the instruments, not the observed behavior.


## Scope and limits

- Generic rejection text remained noncausal, and unidentified submitted versions remained unknown. Supported API work was surfaced without inventing Kubernetes experience.
- Prototype onboarding, rules-based qualification, pricing, and payment setup supported scoped engineering language. Strategy ownership, partnership wins, production launch, and measured revenue claims were held individually while three distinct variant bullets were completed.
- Six requisitions retained their separate identities and chronological evidence. Acknowledgment, state eligibility, role cancellation, a different-role invitation, and a later same-role correction were distinguished.
- The mock profile retained its authorized account and audience, received the intended file, and was read back. Private-message instructions stayed out of the public workflow; the workflow granted no future publication authority.

The profile case uses text stand-ins and a mock CLI. It does not test real authentication, PDF/Word rendering, ATS parsing, real-site upload behavior, retrieval completeness, automatic skill selection, or the truth of any real person's experience. Those require separate evidence and QA. Public fixtures and output artifacts contain fictional people and correspondence only. Native execution records are retained by the evaluator rather than published because they include host paths and runtime metadata; the public hashes identify those records.

## Reproduce

Use the installed ADE split-testing skill's current runtime instructions and the portable plans in [`evals`](../evals/README.md). Qualify the checks before running the model plan. The portable plan maps the two canonical resource files individually rather than retaining the initial staging directory, and lets ADE discover the host's provider key variable. The tested resource content hashes are in [`resource-hashes.json`](../evals/resource-hashes.json); `SKILL.md` and `references/ledger.md` were not changed by this evaluation. Do not add credentials, real emails, personal application records, or runtime homes to this directory.

Mean execution time was 119.3 seconds without the skill and 155.5 seconds with it. Native token totals were {"baseline": {"cached_input_tokens": 533760, "input_tokens": 743118, "output_tokens": 47813}, "skill": {"cached_input_tokens": 871296, "input_tokens": 1100473, "output_tokens": 64064}}. Dollar rates were not available from the configured gateway; no cost estimate is invented. These small-sample timing observations do not decide a quality ranking.
