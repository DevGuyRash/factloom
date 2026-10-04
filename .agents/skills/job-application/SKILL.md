---
name: job-application
description: Apply to jobs autonomously for a person in this repository, from pages open in their browser and from their job sources — choose or tailor the resume, write cover letters from templates, fill and submit forms from their session answers, track everything, and keep going until stopped. Also runs session onboarding, follow-ups, interview prep, and the review inbox.
---

# Job application

You work through whatever browser or computer-use tools the host provides, in the person's own signed-in sessions. The repository is your memory, located by frontmatter `type` as AGENTS.md describes, and `./resumes` is your toolbox: `./resumes help <command>` gives exact usage.

## Working on your own

- The person's standing instruction (in their profile) or their answer at the start of the session decides whether you submit on your own. Once it does, it covers every application in the run: never ask the person to approve a single application. Your host's own rules still apply: when they require the person's confirmation at the moment of a step (submitting, or accepting terms), an answer given earlier does not stand in for it. Hold that application at that step, with what it asks quoted in the record, go on to the next posting, and put all such confirmations to the person together in the next batch.
- A run lasts until the person stops it. A posting you cannot finish, a question you cannot answer, a blocked site, a batch of submissions, or a quiet search costs one posting or one source, never the run ("When leads run out" says what to do when the searches come up empty).
- Work things out before handing them over. Look in the repository first: the profile, evidence, saved and session answers, earlier application records, site notes, and company dossiers. Try another route on the site: the employer's own posting, another way to apply, the file input itself. Answer what the evidence settles. Hold an application only for a step that belongs to the person ([forms](references/forms.md)) or a question no source settles, and go on to the next posting.
- Do not end your turn to report progress or to wait for an answer (the one exception is a host that cannot wait, in "When leads run out"). Questions go on the waiting list and reach the person in one batch; progress goes in the run log and, at natural points, a notification (`./resumes notify`).

## Start of a session

1. Settle whose applications these are: the person you are talking with unless they name someone else. Skip profiles with `apply: disabled`. When the person has no directory yet, or asks to be set up, start with "First run" in AGENTS.md. When `./resumes status --person <slug>` shows resume intake pending (files in `drop/`, imported resumes not yet `merged`, or no jobs in `facts.yaml`), finish it first ([intake](references/intake.md)).
2. Read that person's profile (including any standing instruction), evidence, stories, inbox, and active resume guides, plus the site notes (`shared/` and `custom/`); `./resumes status` summarizes what is pending.
3. Onboard for this session ([onboarding](references/onboarding.md)): `./resumes onboarding start` carries over the last session's answers, and `./resumes onboarding` lists the open core questions, essential ones first. Ask the essential ones before the first application and the rest in batches once applying has started; when the run will be unattended (the person will be away, or a schedule or automation runs it), ask them all before starting, since nobody will be there to answer later. `onboarding answer` keeps the session-answers file, which you re-read before each application.
4. In the same exchange, settle the `review` items of every guide with `status: needs-review`. A correction changes the resume itself: edit `resumes/source/facts.yaml` (or have the person provide a corrected file when there is no source), rebuild, and commit ([resumes](references/resumes.md)). Research any guide that `./resumes status` lists as needing it before relying on its targets ([resumes](references/resumes.md), "Writing and refreshing a guide").
5. `./resumes run start`, then in one message list the queue, the open tabs, and the searches due (`./resumes searches due`), invite the person to add anything missed, and begin without waiting for a reply. In the same message, recommend himalaya when `./resumes doctor` shows none ([communications](references/communications.md)), and when your browser tools cannot attach files directly, say how uploads will happen ([forms](references/forms.md), "Uploads"): from script in the page or through the host's computer use, otherwise held for the person, who can turn on the host's computer use or a browser integration that attaches files.

When the host gives you no way to operate a browser, prepare each application instead (snapshot, resume, cover letter, every answer) and hold it for the person.

## Work loop

Repeat until the person stops you ([pipeline](references/pipeline.md), [sources](references/sources.md)):

1. **Next posting**: the queue first (`./resumes queue next`), then open tabs, then the next saved search ("Searching"); add what you find to the queue (`queue add` refuses duplicates and blocked employers).
2. **Capture**: `./resumes app new` creates the application directory with record and posting snapshot from the templates; fill the snapshot's details and full text.
3. **Screen** against every constraint the person has given: the session's answers (`prefs.constraints` among them), the profile's search focus, and blocked employers. Skip a posting that conflicts with one or needs eligibility the person lacks (a posting built for another country's workers, contracts, or benefits is one), recording which constraint ruled it out; a constraint the posting does not address is not a conflict, and the form's question about it gets the truthful answer. A posting fits the person's `employment.type` when any arrangement it offers is one they accept, corp-to-corp included when they accept it. Saved searches and guides can lag behind the person's answers: when they disagree, the answers win, and you correct the search or guide. Record the `fit` map ([pipeline](references/pipeline.md) has its keys) and run `./resumes score`: skip a posting when it says to (fewer than half the must-haves met, or a score below the person's `prefs.min-fit`), with that reason (`./resumes app skip`). A posting the person picked out themselves is not skipped for its score alone: tell them the score and follow their call. When several roles at one employer pass, pursue the best fit.
4. **Resume**: `./resumes keywords` ranks the active variants against the posting; choose the one whose guide fits, record it as the record's `resume`, and `./resumes tailor` builds a truth-locked tailored copy. When no variant fits, skip. Upload a resume rendered in a theme marked `ats: safe` to job portals.
5. **Cover letter** when the form takes one and the session's `documents.cover-letter` answer calls for it: start it from the template and render it with `./resumes letter` ([cover letters](references/cover-letters.md)); use the employer's dossier and the person's stories ([communications](references/communications.md)).
6. **Fill** the form ([forms](references/forms.md)).
7. **Submit or hold**: `./resumes app submit` (then `./resumes proof` with the confirmation) or `./resumes app hold`; log it with `./resumes run log`; record the answers given ([records](references/records.md)); commit; go straight to the next posting.

Constraints can come up at any time. When the person states a new one, add it to `prefs.constraints` in the session's answers right away (`./resumes onboarding answer`), drop the queued postings it rules out (`./resumes queue drop`), and offer to save it; a new employer to avoid goes on the block list (`./resumes employers block`).

Held applications collect in a waiting list. When the person is present, put the held questions and person-only steps to them in one batch; when they answer, resume those applications. When the person says they are leaving, put the open core questions and the waiting list to them in that same reply. While they are away, keep working rather than waiting on them. Send a notification when a run needs the person or finishes (`./resumes notify`), once for each new batch and never again for blockers already reported.

## Searching

The saved searches are a rotation that carries the search from session to session and keeps a long run supplied:

1. **Cover every target.** Each active resume's guide names its target titles ("Target roles" and `use_for`). Keep a saved search for each of those titles on each job site the person uses, sorted newest first; one search can cover several titles where the site's query takes them together (OR, or a list), which keeps the number of searches, and the load on each site, down. Add missing ones with `./resumes searches add`, remove ones for resumes no longer active from the searches file, and correct any that disagree with the person's answers.
2. **Take the next one.** `./resumes searches next` names the search that ran longest ago, whether or not it is due. Run it, work through its results newest first until a page holds nothing new, queue what passes the screen with its company and role (`queue add --url … --company … --role …` reports what is already queued or applied for; without company and role it knows only the link), and `./resumes searches mark <id>`. The work loop then applies to what you queued before taking the next search. Each search picks up what was posted since its last run, and the rotation alternates sites rather than running one site's searches back to back.
3. **Skip a site that stops you.** A rate limit, a site-wide CAPTCHA or browser check, a warning about automated activity, or a lapsed sign-in costs that site's searches for the rest of the day. Do not mark them, since they did not run: note the time in the run log and the site notes, put any step only the person can take on the waiting list once, and leave the site out (`./resumes searches next --skip-sites <site>`). A CAPTCHA on a single application form holds only that application.
4. **Finish a pass.** Log when a pass through the rotation begins (`./resumes run log --kind note`); the pass is complete when every search on a site still open today has run since then, which is when `searches next` (skipping the closed sites) names one that ran after the pass began. When a complete pass found nothing new that passes the screen, follow "When leads run out".

## When leads run out

Widen the search before treating the leads as exhausted, in this order, working whatever turns up. A widening that keeps finding postings, such as a new title or an employer's careers page, becomes a saved search (`searches add`), so later passes cover it.

1. Every job source in the profile and every signed-in job site in the open tabs, past the first page of results.
2. Older postings: widen the posted-date window, up to about 30 days.
3. Close variants of the target titles, and the guides' keywords as queries.
4. Employers directly: the careers pages of companies named in the guides' market notes, the person's priority employers (`./resumes employers list`), and the company dossiers.
5. Filters that are preferences rather than constraints, such as a pay filter that hides postings without pay or a location filter on remote roles: relax them, and screen each posting against the person's answers instead.
6. Held applications: retry those that waited on a site problem, and finish those whose question the evidence or a newer answer now settles.

When nothing new passes the screen, the leads are exhausted for now:

1. Use the time: draft the follow-ups that are due (`./resumes followups`), research the guides `./resumes status` lists as due and bring their searches in line, and add what you learned to the site notes.
2. Record the pass in the run log, and send one notification with the run's totals and the batch of questions only the person can answer; skip it when nothing has changed since the last one.
3. When the person's instruction is to keep going until stopped, keep watching for new postings. On a host that starts you again on a schedule, end this activation; the next one picks up the rotation. Otherwise wait with whatever the host gives you (a sleep or timer, in steps its time limits allow) about half an hour, longer after each pass that finds nothing (up to a few hours), and start the next pass with `searches next`. When the host gives you no way to wait without ending your turn, end it with the run log and queue current, and say in that last message that the run resumes when the person says so or when a schedule they set up starts it; set one up only when they ask. New postings restart the work loop, and only the person ends the run. Without such an instruction, end the session ("End of a session").

## Long, unattended, and scheduled runs

A run can last weeks. The repository holds its state, so nothing depends on your memory: the session's answers, the queue, the application records, each search's `last_run`, the held applications, and the run log. When your context has been compacted, or you start again, re-read them before going on. Do not onboard again; the session's answers stand until the person changes them.

Once a day (log each summary as a note, so the run logs show when the last one went out):

- End the run log and start a new one (`./resumes run end`, `./resumes run start`), so each day has its own counts.
- Send one summary notification: submitted, held with what each needs, skipped, and the searches run, unless the person asked for less.
- Draft the follow-ups that are due, retry held applications whose blocker may have cleared, refresh any guide `./resumes status` lists as due for research, and commit and push.

Some hosts end a turn after a while or start you again on a schedule (a heartbeat, an automation, a loop). Each activation continues the same run:

- Start it by reading the newest run log (`people/<person>/runs/`): when it is still `running` and its last entry is less than about 15 minutes old, another activation is at work, so end this one without changes. Otherwise `./resumes run start`, then read the state above.
- Work exactly as above. An activation ends when the leads are exhausted ("When leads run out") or the host stops it, never after one pass, one batch, or a set number of applications.
- Before it ends, bring the queue and records up to date, `./resumes run end`, and commit, so the next activation picks up where this one stopped.
- An automation's prompt should point to this skill rather than restate it, so the behavior lives in one place. For example: "Continue <person>'s job applications in <repository> with its job-application skill, autonomously, until <person> says stop," followed by anything the person said in their own words. Leave how to search, when to wait, and when to stop to this skill.

## End of a session

When the person stops you, or when leads run out and their instruction is not to keep going:

- `./resumes run end`, `./resumes dashboard`, and summarize: submitted (with confirmations), held (with exactly what each needs from the person), and skipped (with reasons).
- Show new inbox entries (`./resumes inbox`) and offer to review them now; offer to save this session's answers (`onboarding answer … --save`).
- Clear the session password, if there is one: `./resumes credentials clear`.
- Add dated notes to `custom/site-notes.md` for anything a future session should know, run `./resumes check`, commit, and push.

## Other requests

- Bringing in a person's existing resumes (any format, several versions) or building their first one: [intake](references/intake.md).
- Onboarding, saving answers, or reviewing the inbox: [onboarding](references/onboarding.md).
- "What's pending?", follow-ups (`./resumes followups`, `./resumes draft follow-up`), outcomes (`./resumes outcome`), and what is working (`./resumes stats`, `./resumes dashboard`): [pipeline](references/pipeline.md).
- Interview prep, thank-you notes, company dossiers, email codes and alerts: [communications](references/communications.md).
- A trial on mock forms, which checks an agent's screening and form filling before long unattended runs: [trials](references/trials.md).
