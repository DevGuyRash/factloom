# Contributing to factloom

Thanks for helping. factloom is the engine (tools, themes, templates, the onboarding catalog, and the agent skill); people's data never comes here.

## Working on the engine

1. Clone the engine (or your fork of it) on its own, separate from any copy that holds your data, and run `./resumes setup --engine`. That marks the checkout for engine work (`git config factloom.role engine`), so agents there change engine files directly instead of treating it as someone's copy. Add `--private-copy <path to your own copy>` so the push guard also checks your engine changes for your name, email, phone number, and links.
2. Implement the requested behavior and use the [validation guidance](#validation) below.
3. Keep the single sources single: types and statuses in `tools/src/lib/schema.ts`, theme settings in `tools/src/render/theme.ts` (and `docs/themes.md`, which a test keeps complete), numbers in `shared/pipeline.yaml`, terms in `shared/lexicon.yaml`, documents in `shared/templates/`.
4. Use the fictional demo person (`examples/demo`) for examples and tests; never real people. Rendering changes need a demo build and inspection of the affected text and pages. Refresh gallery images only when their output changes; PDF checks need LibreOffice.
5. To check a change against your own resumes before anyone gets it, run this checkout's tools against your private copy; nothing in your copy changes. `RESUMES_ROOT=../my-job-search ./resumes build-resumes --check` lists your generated resumes that would render differently, and `RESUMES_ROOT=../my-job-search ./resumes build-resumes --person <you> --out /tmp/preview` renders them for a look.
6. Open a pull request describing what changed and why (maintainers may push straight to `main`). Every copy, the maintainer's own included, picks the change up with `./resumes update`.

## Validation

Start with the smallest real end-to-end workflow that demonstrates the requested behavior, using fictional fixtures or the demo. Establish that workflow before adding integration coverage, then unit coverage for isolated rules. Run relevant existing tests and typecheck changed TypeScript; use the full suite when shared behavior or unresolved risk warrants it. Commands are in [tools/README.md](tools/README.md#tests-and-typecheck).

Documentation-only changes need repository/link checks, not compilation, test suites, or resume rebuilds. The commit hooks still run `./resumes check` and the staged privacy scan; preserve signing and push guards. Reuse passing checks until edits or new evidence invalidate them. Report failed or unavailable checks and their impact honestly. Hosted CI is manual-only; use it only when explicitly requested.

## Contributing from your private copy

Your copy's history contains your data, so never push its branches to the engine. Instead, put the engine change on a branch that starts from the engine:

```bash
git fetch upstream
git switch -c my-fix upstream/main
git cherry-pick <the commits that touch only engine files>
```

Then push that branch to your fork of the engine and open a pull request. The pre-push guard refuses any push to the engine that would carry `people/` or `custom/`, or a name, email, phone number, or link from a profile in your copy.

## New themes

A theme is a YAML file in `shared/templates/themes/` with a `description`, an `ats` rating, and only the settings that differ from the defaults. Check it with `./resumes themes check <name>` (contrast and fonts), render it with `./resumes themes preview --themes <name>`, add its image to `docs/themes/` and the README table, and prefer fonts that ship with Word on Windows and Mac.
