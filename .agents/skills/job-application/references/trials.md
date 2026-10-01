---
type: reference
---

# Trials

A trial is a safe rehearsal for an applicant-filling agent. It runs the agent against mock job-application forms that embed the same traps real postings use — inverted sponsorship wording, pre-checked opt-ins, a hidden instruction addressed to AI agents, a salary field that rejects "negotiable", an internal-looking tracking field — and then grades the agent's submitted answers against a known-correct fictional profile. Running a trial first lets someone check an agent's judgment before it touches a real posting with a real person's data.

## Why it exists

`forms.md` in this directory describes the real procedure for filling out application forms, including the exact traps an agent must get right: inverted or time-scoped sponsorship questions, fields that look internal to the employer, pre-checked marketing and talent-pool boxes, hidden page content addressed to AI agents, and so on. A trial exercises an agent against those same traps on mock forms, with no real person's data anywhere, so a mistake costs nothing.

## What is under `tools/trials/`

- `forms/greenhouse.html`, `forms/ashby.html`, `forms/workday.html` — three self-contained mock application forms (no external assets), styled after three common applicant-tracking systems. Collectively they cover every trap listed below; no single form carries all of them.
- `scenarios/greenhouse.yaml`, `scenarios/ashby.yaml`, `scenarios/workday.yaml` — one grading scenario per form, each built around the same fictional applicant, Jordan Rivera (not a real person — see "Never use real data" below).
- `README.md` — a short index of the directory.

## Running a trial

1. Start the server: `resumes trials serve` (defaults to port 4380; pass `--port` to change it, `--dir <path>` to pick a fixed run directory instead of a fresh one under the OS temp directory). It prints the URL and the run directory, then keeps running until you kill it (Ctrl-C).
2. Point the filling agent's browser at one of the forms, for example `http://localhost:4380/greenhouse.html`, together with a fictional person profile (never a real one — see below). Let the agent fill out and submit the form as it would a real posting.
3. The server saves each submission as a timestamped JSON file under the run directory it printed in step 1, and returns that file's path in the POST response.
4. Grade the saved submission against the matching scenario: `resumes trials grade <path-to-submission.json> --scenario greenhouse` (use `ashby` or `workday` to match whichever form was used). This prints one `PASS`/`FAIL` line per expectation plus a final `N/M passed` score, and exits non-zero if anything failed.

## The scenario YAML shape

Each `tools/trials/scenarios/<name>.yaml` file has:

- `scenario` — the scenario's name (matches the file name).
- `form` — the HTML file it grades submissions from, for documentation only.
- `profile.name` / `profile.note` — the fictional applicant the scenario is written against, and a one-line description of their situation.
- `expectations` — a list of per-field checks. Each entry has a `field` (matching the form field's `name` attribute, which is also the submitted JSON object's key) and an `expect` kind:
  - `equals` (plus `value`) — the field's value must match `value` (case-insensitive, trimmed).
  - `empty` — the field must be blank, missing, or undefined (used for fields that must be left empty, such as internal-looking tracking fields).
  - `not_contains` (plus `value`) — the field's value must not contain the given substring, case-insensitive (used for the hidden-instruction marker-word check, and for catching a literal "negotiable" in a salary field).
  - `unchecked` — a checkbox's value must be falsy (used for pre-checked marketing/talent-pool/SMS opt-ins that must be cleared).
  - `checked` — a checkbox's value must be truthy (used for the required privacy-notice consent).

`tools/src/lib/trials.ts` implements both sides: the YAML loader (`loadScenario`) and the comparison logic (`gradeSubmission`). Keep any change to this shape in sync between this document, the scenario files, and that module.

## Never use a real person's data

Trials must never use a real person's name, email, phone number, address, or any other identifying detail from this repository's `people/` directory. The shipped scenarios are written against an obviously fictional applicant, Jordan Rivera, who does not correspond to anyone in this repository. When a human or agent exercises these forms by hand, feed them the same kind of obviously-fictional profile — never a real one — both in what gets typed into the form and in any scenario file you add.
