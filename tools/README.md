# tools

TypeScript CLI for factloom: resume and letter rendering with themes, templating, pipeline
commands, the privacy guard, and the repository checker. Runs on native Node type stripping (Node
22.18 or later), with no build step. Commands live one per file in `src/commands/`; `./resumes help`
discovers them.

## Setup

From the repository root, `./resumes setup` does the whole setup: the first `./resumes` run installs
dependencies, and setup enables the git hooks (checks before each commit, the privacy guard before
each push), the Word and PDF diff drivers, and the engine remote, then runs `doctor`. `just bootstrap`
does the same for those who use `just`.

## Everyday commands

| Command | What it does |
|---|---|
| `resumes check [root]` | Validates repository conventions (frontmatter types/fields, one profile per person, active resume variants, application directories, saved answers, cover letters, tracked files). Exit 1 on any error; warnings print but do not fail. |
| `resumes pii [--staged] [paths...]` | Scans Markdown/text/docx content for SSNs, labeled birth dates, card numbers (Luhn-checked), API-key/token shapes, and street addresses. `--staged` scans only files staged in git. Exit 1 on any finding not covered by `shared/pii-allow.yaml` or `custom/pii-allow.yaml`. Never prints a full matched secret. |
| `resumes themes list\|show\|check\|preview\|new` | Themes: see `docs/themes.md`. |
| `resumes setup`, `resumes update`, `resumes guard` | First-time setup, engine updates, and the push guard that keeps `people/` and `custom/` in the private repository. |
| `resumes person new`, `resumes import`, `resumes variant new` | A new person; their existing resumes imported from `drop/` in any format (originals archived, text extracted, unreadable files marked for the agent); resume variants built from `facts.yaml`. |

Run `resumes help` for the full command list and `resumes help <command>` for one command's usage.

## Tests and typecheck

```sh
npx tsc -p .                        # typecheck
node --test 'tests/**/*.test.ts'    # all tests
node --test tests/check.test.ts     # one file
```

Tests use fixtures from `tests/helpers/fixture.ts` (a throwaway repo under the OS temp dir) rather
than this repository's real data.

## The checker's rules

Each rule is a small module in `src/checks/`, registered in `src/commands/check.ts`. All of them
read their types, required fields, enum values, and patterns from `src/lib/schema.ts` — that file
is the single source of truth for the document model; nothing in `checks/` restates it.

- `frontmatter-types` — known `type`, required fields, enum values, `person` matches its
  directory, `application.updated` is a date.
- `person-profile` — exactly one `profile` per person directory.
- `active-variants` — each active resume variant has exactly one guide and at least one
  `.pdf`/`.docx`, files only, and resume text free of draft markers (`DRAFT_MARKERS` in
  schema.ts). Resume text extraction (docx via `jszip`, PDF via `/usr/bin/pdftotext` when present)
  lives in `src/lib/pii.ts` and is shared with the PII scanner.
- `applications` — each application directory is named `YYYY-MM-DD_company-slug_role-slug` and
  holds exactly one `application` record.
- `answers` — each saved answer entry has a known policy and an `- Answer:` line; an entry with
  no answer yet is a warning.
- `cover-letter-lint` — a cover letter's company/role match its application record's, its body
  mentions the company, it carries no draft markers, and it repeats no phrase listed under
  `confirm:` in the person's `resumes/source/facts.yaml` (silently skipped when that file does not
  exist yet).
- `docs-consistency` — every type in `DOC_TYPES` appears somewhere in AGENTS.md's type table
  (warning only; the schema is the source of truth, not the doc).
- `tracked-files` — git-tracked files exclude editor lock files, `*.local.*` overlays, dependency
  directories, and anything over 20 MB.

- `doc-commands` — every `resumes <command>` and script path named in AGENTS.md, the READMEs, the
  skills, and the justfile exists.

## Git hook

```sh
git config core.hooksPath .githooks
```

Enables `.githooks/pre-commit`, which runs `resumes check` and `resumes pii --staged` before each
commit (skipping itself with a message when `tools/node_modules` is missing), and
`.githooks/pre-push`, which runs `resumes guard pre-push`: pushes carrying `people/` or `custom/` go
only to the remote recorded by `resumes guard allow` (or one GitHub reports private), never to the
public engine, and engine changes bound for the engine may not contain profile details, in text files or in
the text of Word and PDF files (images are not read, so examples and screenshots come from the demo person).
A push the guard cannot read is refused. Without the
tools installed the pre-push hook refuses, since a privacy check must not be skipped silently.

## CI

`.github/workflows/ci.yml` runs on push and pull request, on Node 22.x and 24.x: `npm ci`, then
typecheck, check (on the repository and on `examples/demo`), the upstream guard (in the public
engine only: no personal data), and the tests. It does not need LibreOffice; tests that need it skip.
