# custom/

Your repository's own layer. Files here override or add to the engine's defaults in `shared/`, and engine updates never touch them. Everything you put here stays in your private repository.

| Put here | To |
|---|---|
| `templates/themes/<name>.yaml` | add a theme, or change one of the engine's by using its name (`./resumes themes new <name> --from <theme>`) |
| `templates/documents/<name>.md.hbs` | change a document template (cover letter, record, follow-up) for everyone in this repository |
| `onboarding.md` (`type: onboarding-catalog`) | add onboarding questions, or replace one by its id |
| `pipeline.yaml` | change follow-up days, scoring weights, and other pipeline numbers |
| `lexicon.yaml` | add skill terms and aliases for keyword matching |
| `pii-allow.yaml` | allow specific files or strings the personal-data scan flags |
| `site-notes.md` (`type: site-notes`) | your dated notes on job sites |
| `companies/` | company dossiers (`./resumes company new`) |

One person's own overrides go in `people/<person>/templates/` instead.
