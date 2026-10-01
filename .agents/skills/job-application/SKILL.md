---
name: job-application
description: Apply to jobs autonomously for a person in this repository, from pages open in their browser and from their job sources — choose or tailor the resume, write cover letters from templates, fill and submit forms from their session answers, track everything, and keep going until stopped. Also runs session onboarding, follow-ups, interview prep, and the review inbox.
---

# Job application

You work through whatever browser or computer-use tools the host provides, in the person's own signed-in sessions. The repository is your memory, located by frontmatter `type` as AGENTS.md describes, and `./resumes` is your toolbox: `./resumes help <command>` gives exact usage.

## Start of a session

1. Settle whose applications these are: the person you are talking with unless they name someone else. Skip profiles with `apply: disabled`. When the person has no directory yet, or asks to be set up, start with "First run" in AGENTS.md.
2. Read that person's profile (including any standing instruction), evidence, stories, inbox, and active resume guides, plus the site notes (`shared/` and `custom/`); `./resumes status` summarizes what is pending.
3. Onboard for this session ([onboarding](references/onboarding.md)): `./resumes onboarding` lists saved answers to confirm and the open core questions; `onboarding start` and `onboarding answer` keep the session-answers file, which you re-read before each application.
4. In the same exchange, settle the `review` items of every guide with `status: needs-review`. A correction changes the resume itself: edit `resumes/source/facts.yaml` (or have the person provide a corrected file when there is no source), rebuild, and commit ([resumes](references/resumes.md)). Research any guide that `./resumes status` lists as needing it before relying on its targets ([resumes](references/resumes.md), "Writing and refreshing a guide").
5. `./resumes run start`, then in one message list the queue, the open tabs, and the searches due (`./resumes searches due`), invite the person to add anything missed, and begin. If `./resumes doctor` shows no himalaya, recommend it in that message ([communications](references/communications.md)).

When the host gives you no way to operate a browser, prepare each application instead (snapshot, resume, cover letter, every answer) and hold it for the person.

## Work loop

Repeat until the person stops you or no new matching postings remain ([pipeline](references/pipeline.md), [sources](references/sources.md)):

1. **Next posting**: the queue first (`./resumes queue next`), then open tabs, then due searches; add what you find to the queue (`queue add` refuses duplicates and blocked employers).
2. **Capture**: `./resumes app new` creates the application directory with record and posting snapshot from the templates; fill the snapshot's details and full text.
3. **Screen** against every constraint the person has given: the session's answers (`prefs.constraints` among them), the profile's search focus, and blocked employers. Skip a posting that conflicts with one or needs eligibility the person lacks, recording which constraint ruled it out; a constraint the posting does not address is not a conflict, and the form's question about it gets the truthful answer. Record the `fit` map and run `./resumes score`. When several roles at one employer pass, pursue the best fit.
4. **Resume**: `./resumes keywords` ranks the active variants against the posting; choose the one whose guide fits, record it as the record's `resume`, and `./resumes tailor` builds a truth-locked tailored copy. When no variant fits, skip. Upload a resume rendered in a theme marked `ats: safe` to job portals.
5. **Cover letter** when the form takes one and the session's `documents.cover-letter` answer calls for it: start it from the template and render it with `./resumes letter` ([cover letters](references/cover-letters.md)); use the employer's dossier and the person's stories ([communications](references/communications.md)).
6. **Fill** the form ([forms](references/forms.md)).
7. **Submit or hold**: `./resumes app submit` (then `./resumes proof` with the confirmation) or `./resumes app hold`; log it with `./resumes run log`; record the answers given ([records](references/records.md)); commit.

Constraints can come up at any time. When the person states a new one, add it to `prefs.constraints` in the session's answers right away (`./resumes onboarding answer`), drop the queued postings it rules out (`./resumes queue drop`), and offer to save it; a new employer to avoid goes on the block list (`./resumes employers block`).

Held applications collect in a waiting list. When the person is present, put the held questions and person-only steps to them in batches; when they answer, resume those applications. Send a notification when a run needs the person or finishes (`./resumes notify`).

## End of a session

When the person stops you or the sources run dry:

- `./resumes run end`, `./resumes dashboard`, and summarize: submitted (with confirmations), held (with exactly what each needs from the person), and skipped (with reasons).
- Show new inbox entries (`./resumes inbox`) and offer to review them now; offer to save this session's answers (`onboarding answer … --save`).
- Clear the session password, if there is one: `./resumes credentials clear`.
- Add dated notes to `custom/site-notes.md` for anything a future session should know, run `./resumes check`, commit, and push.

## Other requests

- Onboarding, saving answers, or reviewing the inbox: [onboarding](references/onboarding.md).
- "What's pending?", follow-ups (`./resumes followups`, `./resumes draft follow-up`), outcomes (`./resumes outcome`), and what is working (`./resumes stats`, `./resumes dashboard`): [pipeline](references/pipeline.md).
- Interview prep, thank-you notes, company dossiers, email codes and alerts: [communications](references/communications.md).
- Behavior trials on mock forms before long unattended runs: [trials](references/trials.md).
