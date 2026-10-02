# Intake: bringing a person's resumes in, or building their first one

Use this when a person is being set up, mentions resumes they have, or when `./resumes status --person <slug>`, `./resumes import status --person <slug>`, or `./resumes doctor` shows files waiting in `drop/`, imported resumes not yet `merged`, or a `facts.yaml` with no jobs yet. `./resumes import` does the mechanical part the same way every time. Reading, reconciling, and writing facts are yours, with whatever the host gives you: reading files and images directly, a browser, connected drives, `gh`.

## 1. Gather everything at once

- In one message, ask for every resume they have, in any format and any number of versions, plus anything else that describes their work: a LinkedIn profile (its "Save to PDF" is the simplest), GitHub, a portfolio, certificates, performance reviews. Older versions often hold details newer ones dropped.
- Files go in `drop/`, or the person names paths or folders. `drop/` is shared by everyone in the repository: before importing, make sure every file there belongs to this person (open it, or ask). Another person's files go in `drop/<their-slug>/`, which only their import reads.
- When files live where the host can reach them (a connected drive, an email attachment, a page in the browser), offer to fetch them into `drop/`; otherwise the person adds them. A cloud-drive shortcut (`.gdoc` and the like) is only a link: download the document as Word or PDF. Files a cloud drive keeps online only must be downloaded first; their placeholders are skipped.
- Run `./resumes import --person <slug>`. It reads `drop/` (the person's own folder there, and loose files), or the files and folders given. Each file from `drop/` is moved into `resumes/archive/`; files from elsewhere, or with `--keep`, are copied. It extracts text where a converter can and writes one note per file under `resumes/source/imported/`. Each output line starts with `+` (text extracted), `?` (needs reading), `=` (already imported: the same bytes; it leaves `drop/`, and a missing archived original is put back), `-` (skipped, with the reason: a system file, a linked folder, a document bundle), or `!` (failed: the file stays where it was; fix the cause and run again).
- Lines the scan recognizes (a street address, a Social Security number, a labeled birth date, a card number, a key), and every row of a CSV whose header names such a column, are moved into a git-ignored `<note>.local.md` file beside the note, and that original is archived under a git-ignored `.local` name. So is every original whose text could not be read. Keep it that way: those details never go in resumes or git. `.local` originals stay on this computer only.

## 2. Read what no converter could

For each note with `status: needs-reading`:

- Open the archived original yourself. Read scans, photos, and image-only PDFs directly when you can view images. When you cannot, or your viewer rejects the format: render PDF pages to images (`pdftoppm -png -r 150 <file> <tmp>/page`), convert HEIC or TIFF (`magick` or `sips`, when installed), or run OCR (`tesseract <image> -`, when installed) and check its output against the image. Otherwise ask the person to paste the text or send a PDF or Word file. Keep temporary files outside the repository and delete them.
- An archive (a zip of resumes, a LinkedIn data export): unpack it into a temporary folder outside the repository and import only the files that describe the person's own work: `./resumes import <those files> --person <slug>`. From a LinkedIn export that means Profile, Positions, Education, Skills, Certifications, Projects, Courses, Honors, Languages, Publications, and Volunteering. Never import Connections, messages, Invitations, or any other file holding other people's details. Delete the temporary folder afterwards and set the archive's own note to `merged` with one line saying so.
- Write the original's text in the note's text block as faithfully as you can: the same wording, order, and dates; mark anything unreadable `[illegible]`; correct nothing. A line with a street address, an ID number (a passport, driver's license, or national ID too, which the scan does not recognize), or a birth date goes in the note's `.local.md` file instead.
- Set `status: read`.

For notes with `status: extracted`, compare the text with the original once, before committing anything from intake. Columns, tables, and text boxes can come out in the wrong order: fix the order in the note. Look as well for personal details the scan does not recognize (passport, license, or national ID numbers; a birth date without a label) and move those lines to the `.local.md` file.

## 3. Reconcile the versions

- Line the versions up by employer and date. A claim every version agrees on becomes one fact.
- Where versions differ (titles, dates, employer names, numbers, scope), ask the person, all of the differences in one message. Never choose silently, and do not assume the newest version is right: versions get edited for different jobs, and sometimes inflated.
- A claim found in only one version is still the person's own statement. Use it with the claim's exact phrase in that bullet's `confirm` list (`confirm: ["the phrase"]`) until they confirm it in conversation.
- Official titles and dates go into the profile's employment history as the person confirms them. Forms ask for them and background checks compare them, so when the resumes show a working title or rounded dates, ask for the official ones rather than inferring them.

## 4. Write the facts

- `resumes/source/facts.yaml`: jobs, projects, skills, and lines such as education, in the person's wording. Any number or claim you reword, merge, or cannot trace goes in that bullet's `confirm` list as its exact phrase.
- `evidence.md`: one line per claim with its source (for example "resume of 2024-11-25"), so cover letters and form answers can use it.
- `profile.md`: contact details, links, the employment history and education tables. A street address goes in `private.local.md` (frontmatter `type: private`), never in `profile.md`.
- Set each note's `status: merged` once its content is in the facts. A note whose file adds nothing (an archive whose files you imported, the same version in another format, a file that is not about the person's work) is `merged` too, with one line in the note saying why. These four statuses are the only ones read; anything else counts as `extracted`.
- Then build variants and research their guides ([resumes](resumes.md), "A person's first resume").

## 5. No resume yet: build one together

- Interview in a few batched messages, offering examples so answers come easily: every role, newest first (employer, official title, dates, location, what they did, tools, results with numbers); education and certificates; projects from work, school, volunteering, or their own time; skills; the roles they want next.
- Fill in detail from what the host can reach: a LinkedIn profile the person pastes or saves as PDF (import it like any resume), their GitHub repositories (READMEs, commit history, tests: real projects and real counts), a portfolio, published work. Cite each source in `evidence.md`.
- Draft `facts.yaml` in their words, suggest stronger wording, and keep every changed claim's exact phrase in its bullet's `confirm` list until they approve it. Numbers come from the person or a source, never from you.
- Show the draft built in a few themes (`./resumes themes preview`) and settle every `confirm` before the first application.

## Afterwards

Show the built resume beside the originals, settle the guide's `review` items, and carry on with onboarding. Files the person adds later go through the same steps; `./resumes status --person <slug>` shows them until their notes are `merged`.
