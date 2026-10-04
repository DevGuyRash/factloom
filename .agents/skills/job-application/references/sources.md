# Finding postings

## Open tabs

Classify each tab the person opened: a job posting, an application form, a search-results or listing page, a job source's home page, or a sign-in wall. Postings and forms are worked directly; listing pages and sources are worked as below; sign-in walls go on the waiting list.

## Job sources

The person's profile lists job sources (search engines, job boards, saved searches), and the person may name more in the session.

1. Build each search from the profile's search focus and the session's answers: role titles, work arrangement and location, pay floor, employment type, the person's constraints (`prefs.constraints`), and a recent posting window. Use the source's own filters where it has them, put exclusions in the query where the site takes them (kinds of work the person avoids, blocked employers), and save the filtered results link as the search (`./resumes searches add`). Quote multi-word titles where the site's query would otherwise match the words apart. When a site offers its own structured tools for searching, prefer them over reading pages, list them again after each navigation, and keep reading the page as the fallback.
2. Work through results in order. Read every result card on a page in one pass (a script over the page where your tools allow, rather than opening cards one at a time), and rule out from the card what it already settles (pay, location, arrangement, schedule, a blocked employer, required clearance, or any other constraint) with `./resumes queue skip`. A card can rule a posting out but never in: board labels for employment type, arrangement, and pay are often wrong, and pay a board marks as estimated is its own guess, so the employer's own page decides. Lists that load more cards as you scroll are done only when scrolling adds nothing new.
3. Open the employer's own posting and apply there; record both the source link and the employer link. The employer's page also says whether the posting is still open: a board can keep showing one that closed, which is skipped at once (`./resumes queue skip`).
4. Where a source can mark a posting as applied or hidden, mark it after submitting or skipping, so the source stays deduplicated for future sessions.
5. When a site's apply route itself fails, not just one posting (a one-click flow that can only send a resume it cannot replace, or a profile field it sends that cannot be corrected), note it (`./resumes sitenote`) and stop capturing that site's postings that offer only that route: skip them at the card, until the route is fixed.
6. Save a search that finds postings for a target title (`./resumes searches add`), so later passes run it again ("Searching" in [SKILL.md](../SKILL.md)). A search is done for this pass when its newest results hold nothing new; move to the next. When a whole pass comes up empty, follow "When leads run out" before treating the search as finished.
7. A saved search's query, filters, and notes can lag behind the person's answers (an employment type they now accept, a new pay floor). When they disagree, search by the answers and correct the saved search.

Site notes record how each source and applicant system behaves: `shared/site-notes.md` ships with the engine, and `custom/site-notes.md` (`type: site-notes`) holds this repository's own. Read both (`./resumes sitenote <site>` shows one site's notes from both); add what you learn, dated, with `./resumes sitenote <site> "…"`.
