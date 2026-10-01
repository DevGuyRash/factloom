# Demo data

A complete, made-up person, Jordan Rivera, with everything a real person's directory holds: profile, saved answers, evidence, stories, resume source, and two resume variants. Every name, company, school, number, and contact detail here is fictional.

Point the tools at this directory to try them without touching your own data:

```bash
RESUMES_ROOT=examples/demo ./resumes status --person jordan-rivera
RESUMES_ROOT=examples/demo ./resumes themes preview --person jordan-rivera --variant data-analyst --out /tmp/previews
```

The theme previews in `docs/themes/` are rendered from this person.
