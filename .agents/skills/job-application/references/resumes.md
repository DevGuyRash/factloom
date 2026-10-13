# Resumes: sources, themes, building, keywords, tailoring

The commands below serve both genuine resumes and explicitly authorized [synthetic research](../../resume-builder/references/research-mode.md). In a research-only record, that mode and its batch/per-output controls replace personal-truth requirements with synthetic provenance and consistency when invention is enabled. Read and apply them before selecting or tailoring; the commands do not enforce those controls. The file model, rendering, review flags, and delivery permissions are unchanged. The factual rules below govern genuine career and evidence-only work.

## Content, structure, and style are separate files

- Content (the single source of truth for every claim): `people/<person>/resumes/source/facts.yaml` — `skills`, `projects`, `jobs`, `lines`. Each bullet is `{text, keywords?, confirm?}`; `confirm` lists exact phrases still awaiting the person's own confirmation. Never add a fact that isn't true and traceable.
- Structure (which facts, in what order, under which headings): one file per variant in `people/<person>/resumes/source/variants/<variant>.yaml` — `headline`, `theme`, `output`, `sections` that reference facts by id (`labeled: [skill-id, ...]`, `entries: [{project|job: id, bullets?: [indexes], title?: override}]`, `lines: [line-id, ...]`, or a plain `paragraph`), and optionally `pages` (the most pages it may take) and `style` (theme settings for this variant only).
- Style: a theme (`./resumes themes list`). Themes are YAML files in `shared/templates/themes/` (the engine's), `custom/templates/themes/` (this repository's own), or `people/<person>/templates/themes/` (one person's); a theme can `extends:` another and change only what differs. `./resumes themes show <name>` prints every setting.

Change a resume by editing `facts.yaml` or a variant file, then rebuild. Never hand-edit the generated `.docx`/`.pdf`.

## A person's first resume

1. Bring in their existing resumes ([intake](intake.md)), or, when they have none or theirs is not working, build one with the resume-builder skill (`./resumes import` reads `drop/` in any format; reading, reconciling versions, and writing `facts.yaml` are yours).
2. `facts.yaml` keeps the sourced claims. Preserve approved factual scope through editorial cleanup; unresolved new or changed assertions go in the bullet's `confirm`. See the builder's [writing](../../resume-builder/references/writing.md) for the distinction between meaning and wording.
3. `./resumes variant new <name> --person <slug> --no-build [--theme <theme>]` creates a guide and structure listing every fact; trim and reorder it for that role. Add manual review items and `status: needs-review` only for variants selecting unresolved claims or needing approval of a new intended use. An unused changed bullet does not hold a sibling. Build review copies with `./resumes build-resumes --person <slug> --variant <name> --out <review-dir>` before active delivery; these copies do not regenerate guide flags. Use `--from <variant>` for another variant only when its target needs a different argument or evidence selection.
4. Compare the built resume with the sources and follow the resume-builder [review](../../resume-builder/references/review.md), including extraction and visual checks for each delivered format. Show material changes and unresolved claims to the person; settle the guide's `review` before use. Bullet flags do not cover headlines, titles, skills, or paragraphs: unresolved claims there need manual guide review items.
5. Research the market for each variant and write its guide (below).

## Writing and refreshing a guide

A guide says what its resume is for: the roles to apply to with it, the ones to leave to a sibling variant, and how to find them. Write it from current research, not from the resume alone, when a variant is new, when `./resumes status` lists it as needing research (its `researched` date is missing or older than the pipeline's `guide_research_days`), or when the person changes direction.

1. Follow the resume-builder [research](../../resume-builder/references/research.md): reuse current findings, inspect distinct employers' actual requirements, map them to evidence, and cover differences that could change the target or writing. Record source dates, coverage, limits, and material gaps. Research pay when it affects the target or the person asks; do not repeat a fixed posting quota for every sibling variant.
2. Decide the targets from that research: the titles employers use for this work today, newer titles included; the seniority the person's facts support; the industries and kinds of employers hiring; and the qualifications postings commonly require. Keep only targets the person's facts support, and list stretch roles apart for the person to approve.
3. Write the guide: `headline`, `use_for` (role families, best fits first), `avoid_for` (naming the sibling variant to use instead), `keywords` (terms supported by the person's facts), "Target roles" (titles, seniority, industries, and relevant sourced pay), and dated "Market notes" with the evidence mapping and sources. Set `researched` to the date findings were actually checked; disclose limited coverage. Consider whether an engagement constraint belongs in the headline or guide for the intended audience.
4. When job-search setup is in scope, save searches for the supported target titles on the person's job sites, sorted newest first (`./resumes searches add <id> --url <url> --variant <variant> --site <site> --query <title>`), and remove obsolete targets. Guide research by itself does not start searches, applications, or schedules, or change `apply`.
5. Show the person the targets and the stretch roles; anything they question goes in the guide's `review`.

Research shapes the targeting only. It never adds a claim to a resume: a qualification the market wants that the person's facts do not show is a gap to tell them about, never a keyword to add.

## Choosing a theme

- `./resumes themes preview --person <slug> --variant <name> --png` renders the variant in every theme for the person to choose from, with page counts.
- Use a theme marked `ats: safe` as the starting point for portals, then verify the delivered file's text and layout; the label is not certification by an employer's parser. A theme marked `ats: caution` (the sidebar layout) is for a person-first context. `./resumes build-resumes --theme <name> --out <dir>` renders a one-off copy without changing the variant.
- When a variant must stay within a page count, set `pages: N`; the build tightens spacing, type (never below 9 pt), and margins, and reports changes. Prefer better content selection over unreadable compression; the floor is not the target.
- `./resumes themes new <name> --from <theme>` starts a theme in `custom/` (or the person's own with `--person`); `./resumes themes check` reports unreadable colors and fonts this machine lacks.

## Building

`resumes build-resumes [--person <slug>] [--variant <name>] [--theme <name> --out <dir>] [--out <dir>]` renders every variant under `resumes/source/variants/` (or just `--variant`) into `people/<person>/resumes/active/<variant>/<output>.docx` (+ `.pdf` when LibreOffice is available), or under `--out` when given. `resumes build-resumes --check` writes nothing: it lists generated resumes whose rebuild would differ from their files (`resumes update` runs it after bringing in a new engine).

## Review-item derivation

After each variant builds into its active directory, its `guide.md` `review` and `status` fields are rewritten from the `confirm` phrases of the bullets that variant actually uses (`status: needs-review` when any remain, `ready` otherwise), keeping review items the person wrote by hand; `generated: true` records that the files come from `resumes/source/`, and `fitted` records the page-fitting step a variant with `pages` needed, so checks reproduce the file without LibreOffice. Edit `confirm` lists in `facts.yaml`, not the guide, and rebuild.

Keep unresolved non-bullet claims and necessary pending approval as manual `review` items, with `status: needs-review`. Preserve approval for purely editorial changes within its scope and leave unchanged sibling variants alone. `ready` means recorded flags are clear; it does not prove factual truth, approval, visual quality, or actual ATS parsing.

## Keywords

`resumes keywords <application-dir> [--variant <name>]` reads that application's posting snapshot and a resume variant (`--variant`, else the record's `resume:` field, else the best match, with every variant ranked in the report to help choose), matches both against the person's facts through the lexicon (`shared/lexicon.yaml`, plus `custom/lexicon.yaml` for terms this repository adds), and writes `keywords.md` (`type: keyword-report`) listing terms matched in both, terms true of the person but missing from the resume, and posting terms with no evidence anywhere in their facts. Add new terms to `custom/lexicon.yaml`, not to the command.

This is a lexical diagnostic, not a hiring score. Read the requirements and evidence in context: preserve useful supported terms and skills, distinguish required from preferred, and address visibility gaps without adding unsupported claims or maximizing term counts.

## Tailoring

`resumes tailor <application-dir> [--variant <name>] [--theme <name>] [--allow-unconfirmed]` starts from the variant named in the application record (or `--variant`), reorders its entries, bullets, and labeled skill groups toward the posting's keywords, and writes `resume-tailored.yaml` (`type: tailored-resume`) plus the rendered `.docx`/`.pdf` beside it in the application directory, fitted to the variant's `pages`. It refuses to run when the chosen variant still has unconfirmed `confirm` phrases, unless `--allow-unconfirmed` is passed.

Check the selected and source-wording guides yourself: the command's bullet check does not enforce manual review items. Use unresolved material only in a clearly labeled review preview; `--allow-unconfirmed` never makes it sendable.

The keyword order is a starting point. What you learned about the role decides what the resume leads with: edit `resume-tailored.yaml` to bring in supported facts, drop irrelevant material, reorder, or use a sibling's settled headline, then render with `resumes tailor <application-dir> --spec`. The command renders facts by id and accepts headlines, paragraphs, and entry titles already present in variants. Put new wording in a variant or `facts.yaml` first and review it against its evidence; seek confirmation only when factual meaning or intended use exceeds existing approval.
