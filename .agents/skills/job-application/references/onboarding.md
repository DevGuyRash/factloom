# Onboarding and the inbox

## Session onboarding

Onboarding gets the session the answers it needs to start applying. They are kept for the session in a git-ignored file and reach the committed repository only when the person asks to save them.

1. Gather the person's saved answers. In one message, list them and say they apply unless the person changes any. Saved answers without a `Confirmed` date came from earlier notes or were derived from the profile: ask about those explicitly.
2. Ask the shared catalog's core questions that the saved answers leave open, a few at a time (about five per message), grouped by catalog section and offering the usual choices so the person can answer briefly.
3. Derive what the repository already shows (employment history, education, links, government employment, how-heard) and have the person confirm it in the same batches.
4. Ask for experience-years figures for the skills the target roles name most (languages, platforms, domains), proposing each from the profile and evidence with its basis, so later screening questions are covered.
5. Salary answers come from the person: a figure or range per kind of role and wording for free-text fields.
6. When `accounts.handling` calls for a session password and `./resumes credentials status` shows none, have the person run `./resumes credentials set` in a terminal; open one for them when the host can. It asks for the password without showing it, so never ask for a password in the chat.
7. Write the answers to the session-answers file, then begin applying. Questions met later go to the person as they arise, or onto the waiting list when the person is away; add each answer they give to the file. Constraints the person states later go into `prefs.constraints` the same way, and employers to avoid onto the block list (`./resumes employers block`).

### Session-answers file

`people/<person>/session.local.md` (ignored by git), replaced at each session's onboarding:

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
| `confirm` | Confirm it once during onboarding, then use it. |
| `ask` | Ask the person for each application that needs it; hold the application when they are away. |
| `person` | The person enters it themselves; hold the application for them. |

### What goes where

- The session's answers: the session-answers file.
- Answers the person chooses to keep: the `answers` file.
- A street address and anything else the person wants out of git: `people/<person>/private.local.md` (frontmatter `type: private`), read when filling forms.
- Government ID numbers, date of birth, and bank or payment details are entered by the person on the form itself, so they are never written into files.
- Passwords never go in tracked files. They come from the person's password manager, or, when `accounts.handling` calls for a session password, from `people/<person>/accounts.local.md` (`type: session-credentials`): a git-ignored file that `./resumes credentials set` writes from a hidden prompt, holding the account email and a password used nowhere else, and that `./resumes credentials clear` removes when the session ends.

## Inbox

The inbox collects what a session met but its answers did not cover. Append an entry when a form asks something the catalog lacks, when an answer needed different wording, or when you have a suggestion for the repository:

```
### <YYYY-MM-DD> <company> (<site>): "<question as asked>"
- Answer used: <what was entered, or "held for the person">
- Decided by: person | derived from <source>
- Suggested id: <existing catalog id, or a new id>
- Suggestion: <add to catalog | save as an answer | change wording | other>
```

## Inbox review

When the person asks to review the inbox, or accepts the end-of-session offer, take each entry in turn:

- **Add to catalog**: when the question is generic, add an entry to the shared onboarding catalog (id, what to ask, phrasings seen, shape, default policy, and whether it is core), so future onboarding covers it.
- **Save as an answer**: write it to the person's `answers` file with the policy they choose.
- **Change**: update an existing answer, catalog entry, resume guide, or site note as the person directs.
- **Discard**.

Remove each handled entry from the inbox (git history keeps it), run `./resumes check`, and commit.
