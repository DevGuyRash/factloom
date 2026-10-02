# drop

Put your existing resumes here, in any format: Word, PDF, Pages, OpenDocument, RTF, text, a LinkedIn "Save to PDF", a photo or scan, or several versions at once. Git ignores everything in this folder except this file, so nothing here is committed or pushed. When this repository holds several people, put each person's files in a folder named after them (`drop/<their-name>/`), or tell your agent whose they are.

Then tell your agent "set me up" (or run `./resumes import --person <you>`). Each file is moved into `people/<you>/resumes/archive/` and its text is extracted beside your facts; anything a converter cannot read is left for the agent to read. Lines the scan recognizes (a street address, a Social Security number, a labeled birth date, a card number, a key) are kept in git-ignored `.local` files, and your agent checks the rest by hand before anything is committed. Originals kept as `.local` files stay on this computer only, so keep your own copy of any scan or photo.

No resume yet? Leave this folder empty and ask your agent to build one with you from scratch.
