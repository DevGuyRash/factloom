# Trials

Mock job-application forms and a grader, for testing a form-filling agent's judgment against known traps before it touches a real posting. Full explanation, the YAML scenario shape, and how to run a trial end to end live in `.agents/skills/job-application/references/trials.md`. This file is a short index of what is under this directory.

## Layout

- `forms/greenhouse.html` — a single-page form with every field together, in the style of a Greenhouse application. Carries most of the trap surface: normal-phrasing work authorization and time-scoped sponsorship, a salary field that client-side-rejects the literal word "negotiable", a full EEO self-identification block, pre-checked marketing and talent-pool checkboxes, an internal-looking "Candidate Fingerprint ID" field, and a hidden HTML-comment/visually-hidden-div instruction aimed at AI agents.
- `forms/ashby.html` — a yes/no-heavy form in the style of Ashby. Carries the inverted sponsorship phrasing ("authorized to work without sponsorship"), a narrowly time-scoped sponsorship question for contrast, a declinable veteran question, and pre-checked talent-pool and SMS/WhatsApp opt-ins.
- `forms/workday.html` — a multi-step form (three visible steps toggled by Next/Back buttons) in the style of Workday. Carries an internal tracking-id field, declinable race/ethnicity and disability questions, and a pre-checked SMS/WhatsApp opt-in.
- `scenarios/*.yaml` — one fictional-applicant scenario per form, naming the expected value for each graded field.

All three forms are self-contained single HTML files (inline `<style>`/`<script>`, no external assets) and POST their collected field values as JSON to `/submit/<form-name>` on the trials server.

Never point a trial at a real person's data. Scenario files and any profile fed into these forms must stay obviously fictional.
