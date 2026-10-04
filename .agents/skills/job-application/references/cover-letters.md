# Cover letters

## When

Write a letter when the form requires one, or when it accepts one and the session's `documents.cover-letter` answer calls for it. A required free-text "why this role" field gets the same treatment, sized to the field.

## Content

- Length: 250–400 words in three or four paragraphs; shorter when a text box limits it.
- Opening: the role by its posted title and one specific reason this employer or problem fits the person, drawn from the posting or the company's own site.
- Middle: two or three of the posting's top requirements, each met with a concrete fact from the person's evidence file or active resume (project, system, number, or outcome), echoing the posting's own terms where they are true.
- Close: what the person would take on first, or why the timing fits, and a plain request for a conversation.
- Every claim comes from the evidence file, profile, approved answers, or the chosen resume; figures listed as unconfirmed in the evidence file stay out until the person confirms them. Leave out anything you cannot trace.
- Address a named hiring manager only when the posting names one; otherwise "Dear Hiring Team,".
- Write in the person's plain first-person voice: open with the role and a specific reason, then specific nouns and verbs in short sentences, with facts that add to the resume rather than repeat it.
- The letter holds only what a reader sees: no hidden text and no keyword lists.

## Files

1. Start the letter from the template: `resumes template cover-letter --person <person> --set company=<Company> --set role=<Role as posted> --out <application-dir>/cover-letter.md`. It writes the frontmatter (`type: cover-letter`, `person`, `company`, `role`, `date`) and a body skeleton with HTML-comment prompts for the opening, middle, and close; fill those in and delete the comments:

   ```markdown
   Dear Hiring Team,

   <each paragraph on one line, paragraphs separated by blank lines>

   Sincerely,
   <Full name>
   ```

   Line breaks inside a paragraph are kept as written, which is what keeps the sign-off on two lines.

2. Render it with `resumes letter <letter.md>` from the repository root. It writes `<Name>_Cover_Letter.docx`, plus a PDF when LibreOffice is available, using the person's profile and the resume theme (`shared/templates/themes/`) for the header. To change the letter's look, edit the theme file, not the command. It refuses a letter that `resumes check` would reject (no application record beside it, company not mentioned, draft markers, or a phrase the person has not confirmed) and names each problem.
3. Upload the PDF unless the site asks for Word; for a text box, paste the body paragraphs without the header.

When the builder cannot run, paste the text into the form where it takes text; otherwise hold the application for the person to attach the letter, and note that in the record.

The letter stays in the application directory, where the person can read what was sent.
