# Pipeline commands

The `resumes` CLI (`tools/src/cli.ts`) tracks the funnel around the work loop in
[SKILL.md](../SKILL.md): what to work next, what to avoid, how good a fit it is, and what is still
pending. Numbers behind these commands (follow-up days, stale-queue days, scoring weights, pay
hours-per-year) live in `shared/pipeline.yaml` (the engine's defaults); change a number by setting it in
`custom/pipeline.yaml`, which overrides the defaults and survives updates, never in a command.
Orders, scores, and cadences these commands print are suggestions with their reasons; the person's
own answers, and the checks on truthfulness and privacy, are the lines that bind (SKILL.md,
"Working on your own").

## Session start

1. `resumes searches due --person <p>` — saved searches (`people/<p>/searches.md`, one for each
   target title of an active resume on each job site) that have never run or are due again by their
   own `every_days`; tell the person at the start. `every_days` only spaces searches out between
   sessions and never limits a run. During the run (SKILL.md, "Searching"):
   - `resumes searches next [--count N]` suggests the searches run longest ago, alternating sites,
     with each one's yield, the current pass, closed sites, and paused searches.
   - `resumes searches mark <id> --found N --new N` records a run and its yield; it starts a pass
     when none is going and reports the run that completes one, with the new postings it found.
   - `resumes searches close-site <site> [--until T] --reason "..."` leaves a site out until a time
     (by default the rest of the day); `searches pause <id> [--until DATE] --reason "..."` sets one
     search aside (by default for a week). `--clear` undoes either.
   - `resumes searches add <id> --url <url> --variant <v> --site <s> --query <q>` saves a new one; it
     refuses a taken id, a search already saved, and a resume that is not active.
     `searches remove <id>` drops one.
2. `resumes queue list --person <p>` — see what is already queued, including anything stale.
3. `resumes status --person <p>` — one screen: any submit clicked but not recorded (check the site,
   never resend), held applications grouped by kind with what each waits on, sent ones with a step
   pending, unreadable records, queue and stale counts, follow-ups due, inbox size, guides awaiting
   review or research, and the searches (due, the current pass, closed sites, paused searches).
4. `resumes run start --person <p>` — opens a run log at `people/<p>/runs/<timestamp>.md` for this
   session's counts. It refuses while an open run log was written within `run_active_minutes`:
   another agent may be at work. When that log is your own, from an earlier turn of the same
   conversation, `--takeover` starts anyway. It closes logs left running by an activation that
   stopped without `run end`.

## Per posting

1. `resumes queue next [--count N] --person <p>` — a suggested order, each item with why: work in
   progress first, then the person's own picks (`queue add --pick`) and priority employers, then
   the rest, fresh before stale, higher scores and newer postings (`queue add --posted`) first. An
   item that already has an application names it, to continue rather than start another. Reading
   the queue also closes items whose application was submitted, held, or skipped.
2. `resumes employers check "<Company>" --person <p>` — skip and `resumes queue drop` if blocked;
   `resumes employers block "<Company>" --reason "..."` to block one as you learn it should be
   (current employer, bad experience, etc.); `resumes employers priority "<Company>"` to flag a
   target worth pursuing first.
3. Rule out from the card or the first lines what they settle, with no directory:
   `resumes queue skip --url U [--company C --role R] --reason TEXT --person <p>` (it also logs
   the skip). Capture the rest with `resumes app new` (step 5), then record the fit with
   `resumes score <dir> --fit "must_haves=3/4 pay_ok=yes arrangement_ok=yes location_ok=yes
   seniority=match preferred=1/2"`, which writes this map to the record's frontmatter:

   ```yaml
   fit:
     must_haves_met: 3        # requirements the person meets, of
     must_haves_total: 4      # the requirements the posting states
     pay_ok: true             # pay, arrangement, and location against the person's answers
     arrangement_ok: true
     location_ok: true
     seniority: match         # match, stretch, or over
     preferred_met: 1         # nice-to-haves met, of
     preferred_total: 2
   ```

   Leave out what the posting does not state. Count as must-haves what the posting marks as
   required and the hard gates (degree, years, license, clearance, work authorization); a list of
   tools in one line is one requirement, and "nice to have" items are preferred. `resumes score <dir> --person <p>` writes a 0-100
   score to the record and, if the item is still queued, to the queue entry too, and prints where
   the points came from. Its verdict names each bar and its source: the share of must-haves (the
   person's own when their `prefs.min-fit` answer states one, as in "65, must-haves 40%", else
   `score.must_haves_minimum`) and the minimum score (their `prefs.min-fit`, else `score.minimum`).
   With no must-haves recorded it gives no verdict. `resumes score --fit "must_haves=3/7 pay_ok=yes
   seniority=match preferred=1/3"` scores a posting before it has a record and writes nothing. Skip
   with `resumes app skip`, giving its reason.
4. `resumes queue start <url|#> --person <p>` when you begin working an item already queued.
5. `resumes app new --company X --role Y [--url U] [--source S] [--site Z] [--requisition R]
   [--posted DATE] [--posting-file <file|->] [--location L] [--arrangement A] [--pay-min N]
   [--pay-max N] [--pay-period hour|year] --person <p>` to create the application directory, with
   the posting's text (saved from the page to a file) and its details in the snapshot. It refuses blocked employers (naming the
   entry and its reason) and the same job twice (the same link, or the same requisition at that
   employer). A similar title at the same employer is shown with the earlier record for you to
   compare; a different job proceeds with `--distinct-from <dir> --because "<what differs>"`, noted
   in both records. A skipped posting never blocks another.
6. Submit or hold per `references/records.md`. Each of these writes the run log (`--no-log` skips
   it), so a separate `run log` is only for notes:
   - `resumes app submitting <dir> --person <p>` — just before the final click: until `app submit`
     records the outcome, `status` warns that the submit was clicked, so it is checked on the site
     and never sent twice.
   - `resumes app submit <dir> [--confirmation TEXT] [--proof FILE] [--follow-up <days|date>]
     --person <p>` — sets submitted, `applied`, and `follow_up` (the pipeline's `follow_up_days`
     unless the posting gives its own timeline), saves the proof, and closes the matching queue
     item.
   - `resumes app hold <dir> --reason TEXT [--kind answer|person-step|account|captcha|upload|site|
     confirmation|other] [--waits <catalog-id>] --person <p>` — sets blocked, appends the reason
     (which `status` and the dashboard show, grouped by kind), and closes the matching queue item as
     held; `onboarding answer <catalog-id>` later names the holds it frees. On an application already
     submitted it records the step still pending and keeps it submitted.
   - `resumes app skip <dir> --reason TEXT --person <p>` — sets skipped, appends the reason, and
     closes the matching queue item.
   - `resumes app reopen <dir> --reason TEXT --person <p>` — brings a skipped or held application
     back to drafted when what ruled it out changed.
   - `resumes proof <dir> <file> --person <p>` — copies a confirmation screenshot/PDF/text into the
     application directory and records it as `proof`, keeping any confirmation text already recorded.
   - These close the queue item whose link is the record's employer link or the job-board link it
     was found through. `resumes queue done <url|#> --outcome submitted|skipped|held --person <p>` /
     `resumes queue drop <url|#> --person <p>` close one by hand: a posting skipped before it was
     captured, or one whose record has neither link.
7. Notes: `resumes run log --kind note|error "message" --person <p>` — a line in the open run log
   (when you start a posting, before a wait); outcomes are logged by the commands above.

## Later updates

- `resumes outcome <dir> rejected|interviewing|offer|withdrawn|closed [--note TEXT] --person <p>`
  when the person reports what happened.
- `resumes followups [--days N] --person <p>` — submitted applications whose `follow_up` is due.

## End of session

1. `resumes run end --person <p>` — closes the run log.
2. `resumes dashboard --person <p>` — writes `people/<p>/dashboard.md` (status counts, applications
   per week, held reasons, follow-ups due, queue/stale counts, searches due, guides needing review,
   and the stats tables below) entirely from records — never hand-edit its numbers.
3. `resumes stats --person <p>` / `resumes pay [--by variant|role|site] --person <p>` /
   `resumes export [--format csv|json] --person <p>` for a closer look: response and interview
   rates by variant/cover-letter/source/site, posted pay ranges, or a full row-per-application
   export.
