---
type: reference
---

# Trials

A trial is a rehearsal on mock postings: the agent applies, as the demo repository's fictional person (Jordan Rivera), to job postings served on this machine, the same way it applies for the person, and a grader then checks what it submitted and what it skipped. The postings carry the traps real ones do (described in [forms](forms.md)) and include at least one that does not fit and should be skipped, so a trial checks screening as well as form filling before an agent runs long and unattended on real postings with real data.

## Running a trial

When the person asks for a trial, or accepts one offered before their first long unattended run:

1. `./resumes trials prepare <scratch>/trial-root` copies the demo repository to a scratch directory outside the repository, as Jordan left it before going away: claims confirmed, resumes approved, applying enabled. Every `./resumes` command in the trial runs with `RESUMES_ROOT=<scratch>/trial-root`, for the person `jordan-rivera`, so nothing touches the real people or the committed demo.
2. Start the server in the background: `./resumes trials serve --dir <scratch>/trial-run` (port 4380 by default; `--port` changes it). Submissions are saved in the run directory.
3. Open `http://localhost:4380/` in the browser you would apply with. It lists the open postings like a search-results page. Work through them with the job-application skill's work loop, exactly as for a real person: capture, screen against Jordan's constraints and answers, score, choose and tailor a resume (attach the tailored PDF when the host can upload files), write a cover letter where the form takes one and Jordan's answers call for it, fill the form, and submit or hold. Onboarding is already done: Jordan's saved answers are the session's answers, and Jordan is away, so anything they do not settle goes on the waiting list as it would in an unattended run. Skip what would reach outside the trial: commits, pushes, notifications, and notes written anywhere but the trial copy.
4. Grade the run: `./resumes trials grade <scratch>/trial-run`. It prints one line per posting: each submitted form's fields against what Jordan's answers call for, and each posting that should have been skipped. It exits non-zero when anything failed.
5. Report the grade to the person, with your record of each posting (submitted, held with what it waited on, or skipped with the reason). Then stop the server and delete the scratch directories.

Grade only after the run: the scenario files under `tools/trials/scenarios/` and `tools/trials/README.md` describe the expected answers, so an agent being tried does not read them first.

A failed check points at a step to look at: a field filled against Jordan's answers, a pre-checked box left on, an internal field filled, an instruction from the page followed, or a poor fit submitted. Tell the person which step failed and why. A cause in this skill or the tools is an engine change: add it to the person's inbox as a suggestion (AGENTS.md says how engine changes are made). Run the trial again when the person asks.

## Trials by hand

`./resumes trials grade <submission.json> --scenario <name>` grades one saved submission against one scenario, for checking a single form while editing it. The scenario files have:

- `scenario`, `form`: the scenario's name and the form it grades.
- `profile.name`, `profile.note`: the fictional applicant and their situation.
- `submission: none`, for a posting that should be skipped: any submission fails it.
- `expectations`: per-field checks, each with a `field` (the form field's `name`, which is also its key in the submitted JSON) and an `expect` kind: `equals` (with `value`, compared case-insensitively), `empty`, `not_contains` (with `value`), `unchecked`, or `checked`.

`tools/src/lib/trials.ts` holds the server and the grader; keep this shape in sync between this document, the scenario files, and that module.

## Never use a real person's data

Trials use only the demo repository's fictional person. Never put a real person's name, email, phone number, address, or other details from `people/` into a trial form or a scenario file.
