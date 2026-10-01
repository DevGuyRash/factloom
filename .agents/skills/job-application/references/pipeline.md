# Pipeline commands

The `resumes` CLI (`tools/src/cli.ts`) tracks the funnel around the work loop in
[SKILL.md](../SKILL.md): what to work next, what to avoid, how good a fit it is, and what is still
pending. Numbers behind these commands (follow-up days, stale-queue days, scoring weights, pay
hours-per-year) live in `shared/pipeline.yaml` (the engine's defaults); change a number by setting it in
`custom/pipeline.yaml`, which overrides the defaults and survives updates, never in a command.

## Session start

1. `resumes searches due --person <p>` — saved searches (`people/<p>/searches.md`, one per active
   resume variant) that have never run or are due again. Run each on its site and queue what it
   finds.
2. `resumes queue list --person <p>` — see what is already queued, including anything stale.
3. `resumes status --person <p>` — one screen: held applications and why, queue and stale counts,
   follow-ups due, inbox size, guides awaiting review, searches due.
4. `resumes run start --person <p>` — opens a run log at `people/<p>/runs/<timestamp>.md` for this
   session's counts.

## Per posting

1. `resumes queue next --person <p>` — the next item: an in-progress one first, else the
   best-scored or oldest queued.
2. `resumes employers check "<Company>" --person <p>` — skip and `resumes queue drop` if blocked;
   `resumes employers block "<Company>" --reason "..."` to block one as you learn it should be
   (current employer, bad experience, etc.); `resumes employers priority "<Company>"` to flag a
   target worth pursuing first.
3. Capture the posting (`references/records.md`) and give the record's frontmatter a `fit:` map:

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

   Leave out what the posting does not state. `resumes score <dir> --person <p>` writes a 0-100
   score to the record and, if the item is still queued, to the queue entry too — higher-scored
   queue items come up first via `queue next`. It also gives the verdict: skip when the person
   meets fewer than half the must-haves (`score.must_haves_minimum`), or when the score is below
   their minimum (their `prefs.min-fit` answer, else `score.minimum` in the pipeline config). With
   no must-haves recorded it gives no verdict. Skip with `resumes app skip`, giving its reason.
4. `resumes queue start <url|#> --person <p>` when you begin working an item already queued.
5. `resumes app new --company X --role Y [--url U] [--source S] [--site Z] [--requisition R]
   --person <p>` to create the application directory (refuses duplicates and blocked employers).
6. Submit or hold per `references/records.md`:
   - `resumes app submit <dir> [--confirmation TEXT] --person <p>` — sets submitted, `applied`,
     `follow_up` (from the pipeline config's `follow_up_days`), and marks the matching queue
     item done.
   - `resumes app hold <dir> --reason TEXT --person <p>` — sets blocked and appends the reason.
   - `resumes app skip <dir> --reason TEXT --person <p>` — sets skipped, appends the reason, and
     marks the matching queue item done.
   - `resumes proof <dir> <file> --person <p>` — copies a confirmation screenshot/PDF/text into the
     application directory and records it as `proof`, keeping any confirmation text already recorded.
   - `resumes queue done <url|#> --outcome submitted|skipped|held --person <p>` /
     `resumes queue drop <url|#> --person <p>` keep the queue in sync when an item did not become
     its own `app new` (skipped before capturing, or captured but not queued).
7. Log it: `resumes run log --kind applied|held|skipped|error|note "message" --person <p>` — bumps
   the open run log's counts.

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
