# Reconciliation ledger

Keep the ledger in the person's private copy. Minimize retained correspondence: a precise source pointer, relevant passage or faithful summary, and dates usually suffice. Public upstream fixtures contain fictional identities, employers, messages, and outcomes.

## Review scope

Record the cutoff, source account identity, authorized mailboxes, search queries, pages or cursors exhausted, retrieval date, and unavailable or excluded sources. Record why a message was excluded when it resembles a rejection, for example an acknowledgment that says the company cannot interview everyone. Searches are a retrieval method; keyword hits are not classifications.

## Application record

| Field | Meaning |
|---|---|
| Application identity | Employer, recruiter if distinct, role, requisition or posting URL, submission date or bounded period |
| Outcome timeline | Message date, durable identifier, event, and evidence; include later replies and distinguish separate applications |
| Latest supported disposition | Rejected, role closed, withdrawn, eligibility restriction, progressed, or unresolved |
| Submitted material | Exact retained artifact and hash, recorded variant, or unknown; source of the match |
| Requirements | Historical posting source and capture date; current primary source checked and date; required versus preferred |
| Employer feedback | What the employer actually said, with attribution and limits; generic fit language remains generic |
| Verified experience | Fact identifiers, source, dates, scope, and whether an outcome is estimated, measured, or person-confirmed |
| Comparison | Visibility gap, evidence gap, fit constraint, or hypothesis; no inferred causal claim |
| Disposition of proposed change | Included wording and variant, held factual addition, or no resume change, with reason |
| Verification | Build, text extraction, visual QA, source version, and authorized destination verification |

## Evidence distinctions

“We chose another candidate” says nothing about which skill, keyword, or document feature decided the outcome. “We needed more experience managing production deployments” is attributable feedback about experience, but still does not prove that a particular wording change would have changed the decision. “We cannot hire in your state” is an eligibility explanation that editing a resume cannot fix.

A retained submission record may establish a variant without establishing its exact bytes. A file hash identifies an artifact but does not by itself prove that the employer received it. Correlate artifact identity with a submission receipt or record and preserve the uncertainty that remains.

Use the [synthetic review cases](synthetic-cases.json) when reviewing or evaluating changes to this workflow. They define observable outcomes without any real person's correspondence. Executable behavioral trials, when authorized, should use the installed ADE trial runtime's current documented schema rather than treating this fixture format as an ADE API. Structural validation or a manual walkthrough does not establish improved agent behavior; report untested behavioral claims as untested.
