# Writing the resume

Each choice below is a decision for this person, made from the research and their material, with the reason told to them. What follows is what tends to decide it, not an answer to copy.

## Who reads it, in what order

Most resumes pass three readers. Software extracts the text into fields that recruiters search and filter; it rarely rejects anyone on its own (employers' screening questions do that), but a resume it cannot read is never found. A language model increasingly grades the resume against the posting's requirements, one by one, citing the text that meets each: a requirement never stated plainly, in context, comes back as unmet, and a skill that appears only in a list is weak evidence. A person, when one reads, often sees the model's summary first and then gives the top of the first page a few seconds. Write for all three: text that extracts intact, evidence a model can quote for each requirement, and a first third of a page that makes the case to a person on its own.

## Length and order

- Length is what the person's evidence for these targets needs, and no more: one page suits most people early in their careers and anyone whose relevant record is short; a second page suits a longer record of relevant work. A screening model reads the second page but rewards it no more than the first, and a person may not reach it, so length never excuses putting the strongest evidence low.
- Markets set their own rules: some cap length (US federal applications at two pages; about two is the norm in the UK, Canada, and Germany), academic CVs have no limit, and some countries expect a photo or birth date that others leave off. Research the person's market.
- Order is reverse-chronological, or a hybrid that leads with the strongest relevant evidence: a career change, a return to work, or someone new to a field may lead with projects, training, or a relevant earlier role. A layout of skills without dated roles reads as hiding something. Within each role, the bullet that matters most to this reader comes first.
- Set `pages` in the variant when a page limit is a decision; the build fits the resume to it.

## Sections

The name and contact details come first, as text: city and state or region, email, phone, and the links the person shares. Then what this person's case needs: a headline under the name stating what they are, in the target field's words; a summary only when it states something specific the rest does not (a change of direction, a combination of strengths, the kind of problem they take on), never adjectives; experience, each role with its title, employer, and dates; projects when they show the work better than jobs do; skills grouped as the field thinks of them, each shown in use somewhere above; the education, certifications, and licenses the field checks; and whatever else this field reads as evidence (publications, portfolios, clearances, languages, volunteering). Section names a parser and a person both recognize.

Gaps, contract work, freelance work, and early or unpaid experience are shown honestly, with dates: a gap as one labeled line with anything real done in it; contract roles grouped under the firm, each marked as a contract and naming the client where the person may. Leave out what helps no one judge the work and invites bias: a street address, an objective statement, references, photos, birth dates, and unrelated hobbies, unless the market expects them.

## Bullets

A bullet says what the person did and what came of it, specifically enough to belong to no one else: the object of the work, its scale in the field's own units, the constraint or difficulty, a decision that shows their judgment, and the consequence for someone. "Accomplished X, as measured by Y, by doing Z" is a check that nothing is missing, not a sentence pattern: when every bullet has the same shape, the page reads as generated. A number makes a claim checkable when the person has one; without one, scope, frequency, a before and after, or who relied on the work does the same job. One or two lines each, in the person's register, with ordinary verbs that say what happened, one idea per bullet. Every line has to survive a follow-up question: screening increasingly includes AI interviews and checks against the person's online profiles, so titles and dates agree with those profiles and each claim is one the person can explain.

## Words and keywords

Use the words the target field and its postings use for skills the person truly has, in the sentences that show them in use; a close equivalent of a tool a posting names (another platform, language, or system) is named for what it is, and a letter or written answer can say what carries over: a screening model looks for evidence of each requirement, and recruiters search by skill and title. Copied requirement lists, keyword stuffing, hidden text, and instructions aimed at screening software are deception, and current screening detects and drops them. Writing tools can help with clarity, but polish no longer sets anyone apart; specifics do. Keep the person's own phrasing where it is clear; where you improve it, the changed phrase goes in the bullet's `confirm` list.

## Layout and files

Use a theme marked `ats: safe` for anything a job portal will parse: one column, real text rather than images or icons, contact details in the body rather than a page header, standard headings, one date format. A designed layout (`ats: caution`) suits a resume a person reads first. Send PDF unless a form asks for Word, and keep files small. The build reads each file's text back and reports anything a parser would lose (a bullet garbled by a font, columns read out of order); the review's parser pass looks at the rest ([review](review.md)). Name the file for the person (`<Name>_Resume`), which the variant's `output` sets.
