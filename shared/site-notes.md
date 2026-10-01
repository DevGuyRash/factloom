---
type: site-notes
---

# Site notes

Observations from application sessions and research, grouped by job site or applicant-tracking system. Each note is dated; sites change, so treat a note as a hint to check, not a rule. Add what you observe; the person prunes stale notes.

## hiring.cafe (hiringcafe.com)
- 2026-09-30: Search engine over employer career pages (about 4 million postings from 137,000 companies). Each card links to the employer's own posting ("Job Posting"); applications happen on the employer's site.
- 2026-09-30: Filters cover work environment (remote, hybrid, onsite, field), date posted, apply process, experience, commitment, salary, education, security clearance, travel requirement, and company size and stage.
- 2026-09-30: Cards offer Save, Mark Applied, and Hide; marking needs an account. Simple page fetchers get HTTP 403, so work it in the browser.

## ADP Workforce Now
- 2026-09-25: A mobile verification code was required mid-application; the person enters it.

## Ashby
- 2026-09-30: Single-page forms with yes/no fields; uploads up to 50 MB. Spam protection and per-candidate application limits can block repeated submissions to one employer.

## CEIPAL
- 2026-09-25: The resume Upload control did not expose a usable file picker to the browser tool; hold for the person.

## Greenhouse
- 2026-09-30: Single-page forms; cover letters can be attached or pasted; uploads up to 100 MB. MyGreenhouse can autofill across employers. Some postings link an opt-out from AI screening (see `prefs.ai-screening-opt-out`).
- 2026-09-30: Uses invisible reCAPTCHA.

## iCIMS
- 2026-09-30: Per-employer accounts. Its parser misses contact details placed in document headers or footers.

## Indeed
- 2026-09-25: A Cloudflare challenge interrupted the session; the person completes it.
- 2026-09-30: Indeed Apply may send the Indeed-built resume instead of an uploaded file; confirm which resume is attached. Screener questions an employer marks as dealbreakers reject automatically. Some postings redirect to the company's own site.

## Lever
- 2026-09-30: Single-page forms with an "Additional information" box; pages embed reCAPTCHA or hCaptcha.

## LinkedIn Easy Apply
- 2026-09-30: Keeps up to four resumes and preselects the last one used; prefills saved answers; a "follow company" box is checked by default.

## Rippling
- 2026-09-25: The final Apply click also accepts Rippling's Terms of Service and User Privacy Notice (covered by `consent.required-terms`).

## SAP SuccessFactors
- 2026-09-30: Per-employer accounts.

## Taleo (Oracle)
- 2026-09-25: Registration requires the person to set a password before the application continues.
- 2026-09-30: Sessions time out after 30 minutes.

## USAJOBS
- 2026-09-30: Resumes longer than two pages make the applicant ineligible; questionnaire self-ratings must be supported by the resume.

## Workday
- 2026-09-25: Accounts are per employer and need email verification. "My Experience" accepted resume-parsed entries, then showed generic page errors that blocked advancing; re-check each parsed field against the profile.
- 2026-09-30: Multi-page flow; duplicate candidate profiles are merged by email address.

## ZipRecruiter
- 2026-09-25: External "Apply" redirects sometimes failed to open the employer's form in the agent's browser; hold with the link.
- 2026-09-25: Saved drafts reopened with fields blank, including expected compensation; re-verify every field before submitting.
- 2026-09-25: Some forms ask commute-distance and citizenship-category questions.
- 2026-09-30: 1-Click Apply sends the resume saved in the ZipRecruiter profile with the screener answers, not a file chosen per job.

## Forms in general
- 2026-09-30: Seen on live forms: fields that look internal to the employer shown to candidates; instructions to enter 00000 as ZIP outside the US; date fields demanding MM/DD/YY; a field labelled optional that the form requires; mandatory link fields that void the application when empty.
