# Onboarding and the inbox

## Session onboarding

Onboarding gets the session the answers it needs to start applying. They are kept for the session in a git-ignored file and reach the committed repository only when the person asks to save them.

1. Gather the answers: `./resumes onboarding start` writes the session-answers file from the last session's answers and the saved ones. In one message, list them and say they apply unless the person changes any. Saved answers without a `Confirmed` date came from earlier notes or were derived from the profile: ask about those explicitly.
2. Ask the open **essential** questions (`./resumes onboarding` lists them first) a few at a time (about five per message), grouped by catalog section and offering the usual choices so the person can answer briefly. Ask one fact per question, and where the honest answer comes in degrees (travel, office days, commute, hours, on-call, physical demands), ask for the limit or range the catalog's shape names rather than yes or no, offering typical values: the four `eeo.*` questions go in one message, and the pre-employment screening questions in another (background check and fingerprinting, drug test, conviction history, contacting the current employer, the job's essential functions, and age), each on its own line with its own answer, since a combined question gets a combined answer; the terms and consent questions (`consent.*`) go together too, with the kinds of terms forms show as examples. Where several figures are needed (years with several skills), propose each one from the records for the person to confirm or correct, line by line. When `accounts.handling` hands sign-ins or new accounts to the agent, ask `accounts.email` and `mail.verification` with it; when `employment.type` includes corp-to-corp, ask `employment.business-entity` with it. Propose `experience.years-total` from the profile and evidence, with its basis. When the person's facts have no jobs or projects yet, or `./resumes status --person <slug>` shows resume intake pending, finish [intake](intake.md) before the first application. Pay answers come from the person: the minimum they would accept and the target forms should ask for, each as a salary and an hourly rate, per kind of role, with wording for free-text fields. The address and references are asked up front too, with the note that they stay on this computer: saved, they go to the git-ignored private file, and only references who agreed to be contacted are listed.
3. When you ask `accounts.handling`, say that passwords never go in the chat. When it calls for a session password and `./resumes credentials status` shows none, have the person run `./resumes credentials set` in a terminal; open one for them when the host can. It asks for the password without showing it. If the person types a password into the chat anyway, do not use, repeat, or store it: tell them it now sits in the chat history and should be changed, and offer the hidden prompt.
4. Check the mail route. Mail is how verification codes, receipts, rejections, and interview invitations arrive, so find how you can reach the person's mailbox, in this order: the host's own mail connector or plugin (a Gmail or Outlook integration, for example), a webmail tab signed in to the browser your tools drive, a mail MCP server, or a command-line mail client such as himalaya (`./resumes doctor` shows whether it is installed). Test the route you find with one narrow read the person's grant covers (`mail.verification`, `mail.application-replies`), such as a search for a recent message from a job site. When none works, ask the person once to connect one, suggesting the routes in that order, and keep working meanwhile: codes and replies wait for the person until a route exists.
5. Write the answers to the session-answers file, then begin applying. When the person prefers to finish onboarding first, or the run will be unattended (they will be away, or a schedule or automation runs it), ask the other open core questions and the confirmations in step 6 before starting: nobody will be there to answer them later.
6. Once applying has started, put the other open core questions to the person in batches while they are present: between applications, or together with held questions. In the same batches, have them confirm what the repository already shows (employment history, education, links, government employment, how-heard) and experience-years figures for the skills the target roles name most (languages, platforms, domains), each proposed from the profile and evidence with its basis; for those the records lack, propose none (0) for them to confirm or correct, so a form's question about one is settled once.
7. Questions met later go on the waiting list and reach the person in the next batch, each worded for any employer, so the answer is a session answer every later form reuses rather than a decision about one posting; add each answer they give to the file. A question that is truly about one employer (a relative or referral there, applying to it at all) is the exception. To find which catalog id a form's question is, `./resumes onboarding find "<question as asked>"` lists the likeliest entries with this session's answers; `onboarding answer` then names the held applications that answer frees. Constraints the person states later go into `prefs.constraints` the same way, and employers to avoid onto the block list (`./resumes employers block`).

An answer is the value a form takes, worded as it should appear: "Yes", "$95,000", "Not until an offer". Who said it, when, and the person's own words go in `--notes` (a quote, a condition, an exception), never in the answer, since free-text fields receive the answer as written.

### Session-answers file

`people/<person>/session.local.md` (ignored by git). `./resumes onboarding start` rewrites it at the start of each session from the last session's answers, which stand until the person changes them, and the saved answers; a saved answer confirmed after the last session wins, and `--fresh` starts from the saved answers alone:

```markdown
---
type: session-answers
person: <person>
session: <YYYY-MM-DD>
---

### <catalog id>
- Answer: <the answer, worded as it should appear on forms>
- Policy: auto | confirm | ask | person
```

Re-read it before each application, so long sessions keep the person's exact answers.

### Saving answers

When the person asks to save answers (at any point, or when offered at the end of a session), copy the chosen entries to their `answers` file, adding `- Confirmed: <YYYY-MM-DD>` and any `- Notes:` (conditions, per-company exceptions, wording for free-text fields). Use the catalog's default policy unless the person picks another.

### Policies

| Policy | During the session |
|---|---|
| `auto` | Use the answer. |
| `confirm` | Confirm it once during onboarding, then use it for every application in the run. |
| `ask` | Settled for each application that needs it, in the next batch with the person's other questions; hold the application until then. |
| `person` | The person enters it themselves; hold the application for them. |

### What goes where

- The session's answers: the session-answers file.
- Answers the person chooses to keep: the `answers` file.
- A street address, references' contact details, and anything else the person wants out of git: `people/<person>/private.local.md` (frontmatter `type: private`), read when filling forms. Answers the catalog marks `Stored: local` go there when saved (`onboarding answer … --save`), never into the committed `answers` file.
- Government ID numbers, date of birth, and bank or payment details are entered by the person on the form itself, so they are never written into files.
- Passwords never go in tracked files. They come from the person's password manager, or, when `accounts.handling` calls for a session password, from `people/<person>/accounts.local.md` (`type: session-credentials`): a git-ignored file that `./resumes credentials set` writes from a hidden prompt, holding the account email and a password used nowhere else, and that `./resumes credentials clear` removes when the session ends.

## Inbox

The inbox collects what a session met but its answers did not cover. Add an entry with `./resumes inbox add --company … --site … --question "…" --answer "…" --decided person|derived:<source>` when a form asks something the catalog lacks, when an answer needed different wording, or when you have a suggestion for the repository. It writes:

```
### <YYYY-MM-DD> <company> (<site>): "<question as asked>"
- Answer used: <what was entered, or "held for the person">
- Decided by: person | derived from <source>
- Suggested id: <existing catalog id, or a new id>
- Suggestion: <add to catalog | save as an answer | change wording | other>
```

## Inbox review

When the person asks to review the inbox, or accepts the end-of-session offer, take each entry in turn:

- **Add to catalog**: when the question is generic, add an entry to `custom/onboarding.md`, this repository's additions to the catalog (id, what to ask, phrasings seen, shape, default policy, and whether it is core), so future onboarding covers it; a question every job seeker meets is also worth an engine suggestion in the inbox.
- **Save as an answer**: write it to the person's `answers` file with the policy they choose.
- **Change**: update an existing answer, catalog entry, resume guide, or site note as the person directs.
- **Discard**.

Remove each handled entry from the inbox (git history keeps it), run `./resumes check`, and commit.
