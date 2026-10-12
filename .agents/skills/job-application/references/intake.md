# Intake: bringing a person's resumes in, or building their first one

Use this when a person is being set up, mentions resumes they have, or when `./resumes status --person <slug>`, `./resumes import status --person <slug>`, or `./resumes doctor` shows files waiting in `drop/`, imported resumes not yet `merged`, or a `facts.yaml` with no jobs or projects yet. `./resumes import` does the mechanical part the same way every time. Reading, reconciling, and writing facts are yours, with whatever the host gives you: reading files and images directly, a browser, connected drives, `gh`.

## 1. Reuse records, then gather what is missing

- Read the existing profile, facts, evidence, imported notes, and prior confirmations first. Ask in one message for useful missing resumes or records, in any format: LinkedIn, a portfolio, repositories, certificates, or reviews. Older versions may recover omitted details; having every version is not a prerequisite for a draft.
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

- Line versions up by employer and date; retain the source of each claim. Repeated wording may come from a shared draft, so agreement alone is not independent verification. Keep the person's recorded confirmations.
- Where versions differ materially (titles, dates, employer names, numbers, scope), first check whether the person's evidence already resolves the difference. Ask them only about unresolved conflicts, in one prioritized message, while continuing with settled facts. Never choose silently or assume the newest version is right.
- An unconfirmed claim found in only one version stays attributed to that source, with its exact phrase in the bullet's `confirm` list (`confirm: ["the phrase"]`) until the person confirms it. Preserve prior approval rather than reopening the same claim because it appears in an older file.
- Official titles and dates go into the profile's employment history as the person confirms them. Forms ask for them and background checks compare them, so when the resumes show a working title or rounded dates, ask for the official ones rather than inferring them.

## 4. Write the facts

- `resumes/source/facts.yaml`: jobs, projects, skills, and lines such as education, in the person's wording. Any number or claim you reword, merge, or cannot trace goes in that bullet's `confirm` list as its exact phrase.
- `evidence.md`: one line per claim with its source (for example "resume of 2024-11-25"), so cover letters and form answers can use it.
- Preserve verified skills, distinctive experience, and prior corrections in the facts even when a particular variant omits them. Existing variants and historical tailored specs refer to bullets by index: reword in place and append additions rather than moving or deleting referenced bullets. Put unresolved headlines, skill labels, titles, or other non-bullet claims in the guide's manual `review`; bullet `confirm` flags do not cover them.
- `profile.md`: contact details, links, the employment history and education tables. A street address goes in `private.local.md` (frontmatter `type: private`), never in `profile.md`.
- Set each note's `status: merged` once its content is in the facts. A note whose file adds nothing (an archive whose files you imported, the same version in another format, a file that is not about the person's work) is `merged` too, with one line in the note saying why. These four statuses are the only ones read; anything else counts as `extracted`.
- Then build variants and research their guides ([resumes](resumes.md), "A person's first resume").

## 5. No resume yet, or one that is not working

Build it with the resume-builder skill (`.agents/skills/resume-builder/`): it interviews the person, researches their targets, writes the facts, variants, and guides, and has the draft reviewed by a reader who did not write it.

## Afterwards

Review the built resume and extraction with the resume-builder skill, show the person the material changes and unresolved claims, and settle the guide's `review` items. Continue onboarding only within their requested scope; importing or improving a resume does not start applications or change `apply`. Files added later go through the same steps; `./resumes status --person <slug>` shows them until their notes are `merged`.
