# Named summaries for resumes and profiles

Keep primary claims in `resumes/source/facts.yaml`. Named summaries are authored projections of those claims, not additional evidence. Each channel has its own wording and supporting primary fact references. Channels describe a destination, not a mandatory length: `resume` and `web` are common names; other nonempty channel names work too.

```yaml
summaries:
  general:
    channels:
      resume:
        text: "Data analyst who builds SQL reports for operations teams."
        fact_refs: [skills.analytics, jobs.example.bullets.0]
      web:
        text: "I turn operational data into SQL reports that help teams understand their work."
        fact_refs: [skills.analytics, jobs.example.bullets.0]
```

The example assumes these primary facts exist and support the wording. References use the inventory IDs: `skills.<id>`, `jobs.<id>.title`, `jobs.<id>.bullets.<index>`, `projects.<id>.title`, `projects.<id>.bullets.<index>`, and `lines.<id>`. They must be nonempty, unique and resolvable. A summary cannot cite another summary or itself. References provide traceability, not proof that a claim is true or that the prose follows from its sources.

A variant selects the summary rather than copying its wording:

```yaml
sections:
  - title: Summary
    summary: general
```

The section defaults to channel `resume`. Set `channel: web` or another channel explicitly when that is the intended document content. A missing channel is an error, never a fallback. Exactly one of `summary`, `paragraph`, `labeled`, `entries`, or `lines` belongs in a section. Existing inline `paragraph` sections continue to work unchanged; migration is optional.

## Review before use

1. Write each channel from the source record. Preserve the same supported professional core across channels, with different emphasis, voice or depth only where the audience calls for it. Do not reduce one channel to an arbitrary word limit or hide unsupported claims behind fact references.
2. Run `resumes summary inspect --person <slug> --summary general --channel web`. Read the exact text, selected evidence, any holds, and the digest. Also inspect the primary source and owning role when checking attribution. Resolve factual questions in the source; a copy's optional `confirm: [...]` records its own unresolved synthesis.
3. After completing the review, run `resumes summary review --person <slug> --summary general --channel web --expected <digest>`, using that exact inspected digest. This records the caller's assertion that review occurred. It does not certify truth, establish the person's approval or authorize publishing. Do not run it automatically during generation, rendering or export. The command refuses unresolved source/copy holds and stale expected digests without changing source bytes.
4. Review each intended channel separately. The saved `reviewed` digest binds exact wording, channel identity, declared source mode/batch, ordered supporting facts, their attribution and confirmation state, and the parent role context of referenced bullets. Inspection exposes this context; absent legacy mode remains unknown, not certified genuine. Changes to these inputs invalidate review. Do not copy stamps between channels or regenerate them merely to clear a warning.

Missing or stale summary review adds a derived guide review item when building an active resume. Supporting bullet holds apply even when the detailed bullet is omitted from that variant. Holds from an unused summary/channel do not affect its siblings. Both tailoring paths refuse affected summaries by default; `--allow-unconfirmed` remains a non-sendable preview. A normal build may render a review draft, but generated `ready` alone still does not mean factual approval or permission to submit.

## Deterministic export and downstream use

Review stamping requires exclusive source editing. The command serializes cooperating review calls with a lock, checks the source again before writing, and atomically replaces the file. It does not provide a compare-and-swap guarantee against an unrelated editor writing between that check and replacement. Finish or pause other edits before stamping; a busy review lock or failed expected-digest check leaves the source unchanged.

```bash
resumes summary show --person <slug> --summary general --channel web
resumes summary show --person <slug> --summary general --channel web --format json
```

Text output is the exact authored text. JSON additionally includes the summary/channel IDs, ordered fact references, current digest, review status, holds and `preview`. Neither output invents or condenses prose. Export does not publish anything, add a website, or include contact fields or the full evidence record.

Missing/stale review or evidence holds block normal export. For review only, `--allow-unreviewed --format json` emits an explicitly marked preview; text-only previews are refused so a consumer cannot lose the warning. Inspection and export never write a review stamp.

A website or other downstream consumer should generate its copy from this command, not maintain a second handwritten paragraph. Retain the exported digest and compare it with the current channel's digest to detect stale source/wording; rebuild after an approved source change. A current digest proves consistency with saved source, not editorial quality or factual truth. Keep generated JSON outside `resumes/active/<variant>/`, whose files remain resumes and their guide. `resumes export` still exports application records, not summaries.

Summaries remain in the same facts file that tailoring captures with its variant. Historical submitted artifacts retain their captured wording and source rather than resolving today's summary. Engine updates distribute the generic capability normally; people's facts and channel wording stay in their private copies.
