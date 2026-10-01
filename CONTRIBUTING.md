# Contributing to factloom

Thanks for helping. factloom is the engine (tools, themes, templates, the onboarding catalog, and the agent skill); people's data never comes here.

## Working on the engine

1. Clone the engine (or your fork of it) on its own, separate from any copy that holds your data, and run `./resumes setup --engine`.
2. Make the change with tests: `cd tools && npm run typecheck && npm test`, and `./resumes check`. Rendering changes need LibreOffice for the PDF checks.
3. Keep the single sources single: types and statuses in `tools/src/lib/schema.ts`, theme settings in `tools/src/render/theme.ts` (and `docs/themes.md`, which a test keeps complete), numbers in `shared/pipeline.yaml`, terms in `shared/lexicon.yaml`, documents in `shared/templates/`.
4. Use the demo person (`examples/demo`) for examples and tests; never real people. If a change alters how resumes render, rebuild the demo (`RESUMES_ROOT=examples/demo ./resumes build-resumes --person jordan-rivera`) and refresh the gallery (`RESUMES_ROOT=examples/demo ./resumes themes preview --person jordan-rivera --variant data-analyst --out /tmp/gallery --png --dpi 80`, then copy the images into `docs/themes/`).
5. Open a pull request describing what changed and why.

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
