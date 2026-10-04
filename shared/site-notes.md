---
type: site-notes
---

# Site notes

Observations from application sessions and research, grouped by job site or applicant-tracking system. Each note is dated; sites change, so treat a note as a hint to check, not a rule. Add what you observe; the person prunes stale notes.

## hiring.cafe (hiringcafe.com)
- 2026-09-30: Search engine over employer career pages (about 4 million postings from 137,000 companies). Each card links to the employer's own posting ("Job Posting"); applications happen on the employer's site.
- 2026-09-30: Filters cover work environment (remote, hybrid, onsite, field), date posted, apply process, experience, commitment, salary, education, security clearance, travel requirement, and company size and stage.
- 2026-09-30: Cards offer Save, Mark Applied, and Hide; marking needs an account. Simple page fetchers get HTTP 403, so work it in the browser.
- 2026-10-04: "Apply directly on employer's site" opens a new tab; find it by comparing the tab list before and after. The posting text is in `#job-description`. Cards can show archived copies of closed postings, so the employer's page says whether one is open. The "N jobs · N companies" line is a cheap check for anything new.

## ADP Workforce Now
- 2026-09-25: A mobile verification code was required mid-application; the person enters it.

## Ashby
- 2026-09-30: Single-page forms with yes/no fields; uploads up to 50 MB. Spam protection and per-candidate application limits can block repeated submissions to one employer.

## Breezy HR
- 2026-10-04: "Apply To Position" opens one page; the resume goes in through an "Upload Resume" link that opens a file chooser. Its parser can turn projects into employers; each parsed entry has a Delete link. The success URL ends `/apply/submitted`. A hiring contact may email a "Follow-up Questions" page within minutes of applying.

## CEIPAL
- 2026-09-25: The resume Upload control did not expose a usable file picker to the browser tool; work down the forms reference's upload routes (the file input itself, script in the page, computer use) before holding for the person.

## Greenhouse
- 2026-09-30: Single-page forms; cover letters can be attached or pasted; uploads up to 100 MB. MyGreenhouse can autofill across employers. Some postings link an opt-out from AI screening (see `prefs.ai-screening-opt-out`).
- 2026-09-30: Uses invisible reCAPTCHA.

## iCIMS
- 2026-09-30: Per-employer accounts. Its parser misses contact details placed in document headers or footers.
- 2026-10-04: Entering an email leads to creating a profile with a new password.

## Indeed
- 2026-09-25: A Cloudflare challenge interrupted the session; the person completes it.
- 2026-10-04: The challenge page can persist for hours; its URL carries a response token, so never copy it into records. `-term` exclusions work in the search query.
- 2026-09-30: Indeed Apply may send the Indeed-built resume instead of an uploaded file; confirm which resume is attached. Screener questions an employer marks as dealbreakers reject automatically. Some postings redirect to the company's own site.

## JazzHR
- 2026-10-04: A cookie banner (reject all), a visible mandatory reCAPTCHA, and required address fields. Some postings label the role "Contracted to Full Time".

## Lever
- 2026-09-30: Single-page forms with an "Additional information" box; pages embed reCAPTCHA or hCaptcha.

## LinkedIn (search)
- 2026-10-04: Search URL filters: `f_JT=C` contract, `f_WT=2` remote, `f_TPR=r604800` past week (`r2592000` for 30 days), `sortBy=DD` newest first. The contract filter also returns postings that are W-2 only or say nothing about tax status. Quote multi-word titles. A typeahead "recent" entry can open one posting instead of a search; a `/jobs/search/?keywords=` URL is reliable.
- 2026-10-04: Result lists load cards as you scroll the list pane: collect the `/jobs/view/<id>` links in one script. Accessible names vary (verified listings' links end "with verification"), so match by link or name prefix. In "All filters", click a radio's label text.
- 2026-10-04: "Apply on company website" opens a tracking redirect in a new tab, with a "Share your profile?" toggle on by default.

## LinkedIn Easy Apply
- 2026-09-30: Keeps up to four resumes and preselects the last one used; prefills saved answers; a "follow company" box is checked by default.
- 2026-10-04: Pages run Contact, Resume, Questions, Review; the phone field is not prefilled, and the review step says the employer also receives the profile. Closing the dialog offers "Save this application?": a saved draft keeps the answers but drops uploaded files. A file-chooser upload works. The confirmation reads "Application submitted". From a side pane, the Easy Apply button can belong to a neighboring listing: check the dialog's title.

## Rippling
- 2026-09-25: The final Apply click also accepts Rippling's Terms of Service and User Privacy Notice (covered by `consent.required-terms`).

## SAP SuccessFactors
- 2026-09-30: Per-employer accounts.

## Taleo (Oracle)
- 2026-09-25: Registration requires the person to set a password before the application continues.
- 2026-09-30: Sessions time out after 30 minutes.

## Teamtailor
- 2026-10-04: The application opens in a dialog that loads seconds after Apply; the upload button opens a file chooser; an optional "Connect" opt-in stays unticked; a receipt email arrives within about a minute.

## TriNet Hire
- 2026-10-04: One page with resume and "Attach another file" (cover letter) inputs; address and postal code are optional. The success URL ends `/thank_you`.

## USAJOBS
- 2026-09-30: Resumes longer than two pages make the applicant ineligible; questionnaire self-ratings must be supported by the resume.

## Workday
- 2026-09-25: Accounts are per employer and need email verification. "My Experience" accepted resume-parsed entries, then showed generic page errors that blocked advancing; re-check each parsed field against the profile.
- 2026-09-30: Multi-page flow; duplicate candidate profiles are merged by email address.

## Workable
- 2026-10-04: A cookie banner comes first (decline all). The "Import resume from" menu is not the Resume field, which has its own "Choose file". Some forms require current salary or ask monthly salary expectations. The success URL ends `?success`; an optional EEO survey offers "Skip EEO survey for now". A receipt email repeating the answers arrives within a minute.

## Workstream
- 2026-10-04: A promotional dialog opens first; web-development roles may require links to live sites; the final submit also accepts its Terms and SMS messages.

## ZipRecruiter
- 2026-09-25: External "Apply" redirects sometimes failed to open the employer's form in the agent's browser.
- 2026-10-04: External redirects (`/job-redirect?match_token=…`) usually reach the employer's apply page in a new tab; hold with the link only when one does not.
- 2026-09-25: Saved drafts reopened with fields blank, including expected compensation; re-verify every field before submitting.
- 2026-09-25: Some forms ask commute-distance and citizenship-category questions.
- 2026-09-30: 1-Click Apply sends the resume saved in the ZipRecruiter profile with the screener answers, not a file chosen per job.
- 2026-10-04: A listing is identified by its `lk` key (the structured tools' `listingKey`); there is no page per listing, so record links carry `lk`. Search matches titles, not employer names; "Re-posted N days ago" dates the repost. "Estimated pay" (`salaryIsEstimated`) is the site's guess, not the employer's figure.
- 2026-10-04: The page's own structured tools (search with remote and contract filters, results, job details) go stale after a navigation and are sometimes switched off: list them again, or read the "Job listings" region. Typing in the search box can append to the old query.
- 2026-10-04: 1-Click screeners are radios plus Continue; an optional profile step needs "Skip", then "Skip this step?"; the job's button turning into a disabled "Applied" is the proof. To change the profile resume: Profile, Resume, Replace (it opens a chooser only for a native click), Preview, Save Resume, then check the new "Added" time. Minimum desired pay is under Profile, More information, Edit.

## Forms in general
- 2026-09-30: Seen on live forms: fields that look internal to the employer shown to candidates; instructions to enter 00000 as ZIP outside the US; date fields demanding MM/DD/YY; a field labelled optional that the form requires; mandatory link fields that void the application when empty.
