# Resumes: sources, themes, building, keywords, tailoring

## Content, structure, and style are separate files

- Content (the single source of truth for every claim): `people/<person>/resumes/source/facts.yaml` — `skills`, `projects`, `jobs`, `lines`. Each bullet is `{text, keywords?, confirm?}`; `confirm` lists exact phrases still awaiting the person's own confirmation. Never add a fact that isn't true and traceable.
- Structure (which facts, in what order, under which headings): one file per variant in `people/<person>/resumes/source/variants/<variant>.yaml` — `headline`, `theme`, `output`, `sections` that reference facts by id (`labeled: [skill-id, ...]`, `entries: [{project|job: id, bullets?: [indexes], title?: override}]`, `lines: [line-id, ...]`, or a plain `paragraph`), and optionally `pages` (the most pages it may take) and `style` (theme settings for this variant only).
- Style: a theme (`./resumes themes list`). Themes are YAML files in `shared/templates/themes/` (the engine's), `custom/templates/themes/` (this repository's own), or `people/<person>/templates/themes/` (one person's); a theme can `extends:` another and change only what differs. `./resumes themes show <name>` prints every setting.

Change a resume by editing `facts.yaml` or a variant file, then rebuild. Never hand-edit the generated `.docx`/`.pdf`.

## A person's first resume

When a person has only an existing resume file:

1. `./resumes import <file> --person <slug>` keeps the original in `resumes/archive/` and writes its text to `resumes/source/imported/`.
2. Write `resumes/source/facts.yaml` from that text (`./resumes person new` created a starter): keep each claim as the person wrote it; put any number or claim you reword, merge, or cannot trace in that bullet's `confirm` list.
3. `./resumes variant new <name> --person <slug> [--theme <theme>]` writes a structure listing every fact and builds it; trim and reorder the structure for that kind of role, then `./resumes build-resumes --person <slug> --variant <name>`. Make further variants with `--from <variant>` and change what differs.
4. Compare the built resume with the original line by line, show it to the person, and settle the guide's `review` items before using it.
5. Research the market for each variant and write its guide (below).

## Writing and refreshing a guide

A guide says what its resume is for: the roles to apply to with it, the ones to leave to a sibling variant, and how to find them. Write it from current research, not from the resume alone, when a variant is new, when `./resumes status` lists it as needing research (its `researched` date is missing or older than the pipeline's `guide_research_days`), or when the person changes direction.

1. Research the market for what this variant shows the person can do: read a broad sample of recent postings (twenty or more, across the boards the person uses and employers' own career pages) and current pay data for the person's locations. Keep the date and source of everything you use.
2. Decide the targets from that research: the titles employers use for this work today, newer titles included; the seniority the person's facts support; the industries and kinds of employers hiring; and the qualifications postings commonly require. Keep only targets the person's facts support, and list stretch roles apart for the person to approve.
3. Write the guide: `headline`, `use_for` (role families, best fits first), `avoid_for` (naming the sibling variant to use instead), `keywords` (terms postings use that the person's facts truthfully support), the "Target roles" section (titles, seniority, industries, pay ranges by location), and dated "Market notes" with their sources. Set `researched` to today.
4. Save searches that find these roles in the person's searches file (`type: searches`; each item has an `id`, this `variant`, the `site`, a `url`, the `query` and `filters`, and `every_days`), so `./resumes searches due` brings them back on schedule.
5. Show the person the targets and the stretch roles; anything they question goes in the guide's `review`.

Research shapes the targeting only. It never adds a claim to a resume: a qualification the market wants that the person's facts do not show is a gap to tell them about, never a keyword to add.

## Choosing a theme

- `./resumes themes preview --person <slug> --variant <name> --png` renders the variant in every theme for the person to choose from, with page counts.
- Upload resumes to job portals in a theme marked `ats: safe`. A theme marked `ats: caution` (the sidebar layout) is for resumes a person reads first: email, referrals, networking, print. `./resumes build-resumes --theme <name> --out <dir>` renders a one-off copy in another theme without changing the variant.
- When a variant must stay within a page count, set `pages: N` in it; the build tightens spacing, then type (never below 9 pt), then margins, until it fits, and says what it changed.
- `./resumes themes new <name> --from <theme>` starts a theme in `custom/` (or the person's own with `--person`); `./resumes themes check` reports unreadable colors and fonts this machine lacks.

## Building

`resumes build-resumes [--person <slug>] [--variant <name>] [--theme <name> --out <dir>] [--out <dir>]` renders every variant under `resumes/source/variants/` (or just `--variant`) into `people/<person>/resumes/active/<variant>/<output>.docx` (+ `.pdf` when LibreOffice is available), or under `--out` when given. `resumes build-resumes --check` writes nothing: it lists generated resumes whose rebuild would differ from their files (`resumes update` runs it after bringing in a new engine).

## Review-item derivation

After each variant builds into its active directory, its `guide.md` `review` and `status` fields are rewritten from the `confirm` phrases of the bullets that variant actually uses (`status: needs-review` when any remain, `ready` otherwise), keeping review items the person wrote by hand; `generated: true` records that the files come from `resumes/source/`. Edit `confirm` lists in `facts.yaml`, not the guide, and rebuild.

## Keywords

`resumes keywords <application-dir> [--variant <name>]` reads that application's posting snapshot and a resume variant (`--variant`, else the record's `resume:` field, else the best match, with every variant ranked in the report to help choose), matches both against the person's facts through the lexicon (`shared/lexicon.yaml`, plus `custom/lexicon.yaml` for terms this repository adds), and writes `keywords.md` (`type: keyword-report`) listing terms matched in both, terms true of the person but missing from the resume, and posting terms with no evidence anywhere in their facts. Add new terms to `custom/lexicon.yaml`, not to the command.

## Tailoring

`resumes tailor <application-dir> [--variant <name>] [--theme <name>] [--allow-unconfirmed]` starts from the variant named in the application record (or `--variant`), reorders its entries, bullets, and labeled skill groups toward the posting's keywords, and writes `resume-tailored.yaml` (`type: tailored-resume`) plus the rendered `.docx`/`.pdf` beside it in the application directory, fitted to the variant's `pages`. It only reorders what the variant already includes; it never invents or imports new bullets. It refuses to run when the chosen variant still has unconfirmed `confirm` phrases, unless `--allow-unconfirmed` is passed.
