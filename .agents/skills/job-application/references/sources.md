# Finding postings

## Open tabs

Classify each tab the person opened: a job posting, an application form, a search-results or listing page, a job source's home page, or a sign-in wall. Postings and forms are worked directly; listing pages and sources are worked as below; sign-in walls go on the waiting list.

## Job sources

The person's profile lists job sources (search engines, job boards, saved searches), and the person may name more in the session.

1. Build each search from the profile's search focus and the session's answers: role titles, work arrangement and location, pay floor, employment type, the person's constraints (`prefs.constraints`), and a recent posting window. Use the source's own filters where it has them.
2. Work through results in order. Screen from the listing card before opening a posting when the card already shows a conflict (pay, location, arrangement, schedule, a blocked employer, required clearance, or any other constraint).
3. Open the employer's own posting and apply there; record both the source link and the employer link.
4. Where a source can mark a posting as applied or hidden, mark it after submitting or skipping, so the source stays deduplicated for future sessions.
5. Save a search that finds postings for a target title (`./resumes searches add`), so later passes run it again ("Searching" in [SKILL.md](../SKILL.md)). A search is done for this pass when its newest results hold nothing new; move to the next. When a whole pass comes up empty, follow "When leads run out" before treating the search as finished.
6. A saved search's query, filters, and notes can lag behind the person's answers (an employment type they now accept, a new pay floor). When they disagree, search by the answers and correct the saved search.

Site notes record how each source and applicant system behaves: `shared/site-notes.md` ships with the engine, and `custom/site-notes.md` (`type: site-notes`) holds this repository's own. Read both; add what you learn, dated, to `custom/site-notes.md`.
