---
type: onboarding-catalog
---

# Onboarding catalog

Questions that job applications ask, written once for everyone. Session onboarding asks the entries marked **essential** first, before the first application: they settle what to apply for and the questions nearly every form asks. It asks the entries marked **core** in batches once applying has started (all of them, when the person prefers to finish onboarding first). The rest go on the waiting list the first time a form needs them and reach the person in the next batch of questions. The person's saved answers cover any of these. Answers the person chooses to keep are saved in their `answers` file under the same ids.

Each entry lists what to ask the person, phrasings seen on forms, the answer shape, and the default policy (`auto`, `confirm`, `ask`, or `person`, defined in the job-application skill). The person may choose a different policy for their own answer.

## How sessions run

### prefs.pace
- Ask: Any limit on applications per day, or on how soon to apply to the same employer again? No limit unless the person sets one.
- Shape: number per day; days between applications to one employer
- Policy: auto

### prefs.min-fit (essential)
- Ask: How good a match should a posting be before you apply? Each posting gets a fit score from 0 to 100 from the must-haves you meet, seniority, preferred skills, pay, arrangement, and location. Whatever the score, a posting where you meet fewer than half the requirements is skipped. Offer: 50 (anything you could plausibly do, stretch roles included), 65 (solid matches, the default), or 80 (strong matches only).
- Use: `./resumes score` reports whether a posting clears it; a posting below it is skipped with its score as the reason
- Shape: number from 0 to 100
- Policy: auto

### documents.cover-letter (essential)
- Ask: When a cover letter is optional, should one be included: always, only for strong-fit roles, or only when required?
- Shape: choice
- Policy: auto

### accounts.handling (essential)
- Ask: When an application needs a sign-in or a new account on a job site, who handles it: you (the agent holds those steps for you), the agent with passwords from your password manager, or the agent with a password you type once per session into a hidden prompt (`./resumes credentials set`)? An agent whose own rules forbid creating accounts or typing passwords holds those steps whatever the answer.
- Shape: choice: the person, the agent with the password manager, or the agent with a session password
- Policy: confirm

### accounts.email (core)
- Ask: Which email address should new job-site accounts use? Offer the profile's email. An address used only for the job search keeps the mailbox an agent may read to application mail.
- Shape: email address
- Policy: confirm

### mail.verification (core)
- Ask: When a site emails a verification code or link, who reads it: you, or the agent? The agent needs mailbox access through himalaya and reads only the newest message from that site.
- Shape: choice: the person or the agent
- Policy: confirm

### accounts.profile-edits (core)
- Ask: When a job site's own profile would send something out of date with an application (desired pay, location, the default resume), may the agent update that profile to match this session's answers?
- Shape: yes / no
- Policy: confirm

## Identity and contact

### identity.legal-name (core)
- Ask: What is your full legal name exactly as it appears on government ID?
- Seen as: "Legal name (as it appears on your government-issued ID)"
- Shape: text
- Policy: auto

### identity.preferred-name
- Ask: What first name should applications show where they ask for a preferred name?
- Seen as: "Preferred first name", "Name you go by"
- Shape: text
- Policy: auto

### identity.pronouns
- Ask: Do you want to share pronouns when a form offers the field?
- Shape: text, or leave blank
- Policy: auto

### contact.address
- Ask: Which mailing address should forms use? It stays out of the repository: keep it in your local overlay file, or have it asked each time.
- Seen as: "Street address", "Address line 1", "ZIP code", "What is the address from which you plan on working?"
- Shape: street, city, state, ZIP
- Policy: confirm

### location.residence
- Ask: Derived from the profile's location; confirm the state and country of residence once.
- Seen as: "Which U.S. state or Canadian province do you reside in?", "What country are you based in?", "Where do you plan on working from (for payroll tax purposes)?"
- Shape: state, country
- Policy: auto

## Work authorization and eligibility

### work-auth.us-authorized (essential)
- Ask: Are you legally authorized to work in the United States for any employer?
- Seen as: "Are you legally authorized to work in the United States?", "…in the country where the job is located?", "…in the stated location of this role?", "Are you currently eligible to work legally in the United States?"; some forms offer several categories (citizen or national, permit without sponsorship, permit needing sponsorship, not authorized)
- Shape: yes / no
- Policy: auto

### work-auth.sponsorship (essential)
- Ask: Will you now or in the future require employer sponsorship for a work visa?
- Seen as: "Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?", "…to retain or extend your work authorization", "…commence an immigration case", "ever", "at any point". Some forms invert it ("Are you authorized to work without sponsorship?"), where yes means no sponsorship is needed.
- Shape: yes / no; visa type follow-ups (CPT, OPT, TN, J-1) apply only to people who hold one
- Policy: auto

### work-auth.citizenship-category (core)
- Ask: Which category describes you: U.S. citizen or national, U.S. permanent resident, or another work-authorization status?
- Seen as: eligibility dropdowns; employment-eligibility categories on job boards
- Shape: choice
- Policy: confirm

### work-auth.export-control
- Ask: Derived from the citizenship category: are you a "U.S. person" for export-control purposes, and do you hold citizenship in any sanctioned country?
- Seen as: export-control (ITAR/EAR) information requests, sanctioned-country citizenship questions
- Shape: yes / no
- Policy: confirm

### work-auth.clearance (core)
- Ask: Do you hold an active security clearance, and would you be willing to obtain one?
- Shape: clearance level or none; willing yes/no
- Policy: auto

### eligibility.age-18 (core)
- Ask: Are you at least 18 years old?
- Shape: yes / no
- Policy: auto

## Location, arrangement, travel

### prefs.work-arrangement (essential)
- Ask: Which arrangements will you accept (remote, hybrid, on-site), and for hybrid or on-site, which metro areas and how many office days a week?
- Seen as: "This role requires in-office work three days per week… do you acknowledge and agree?", "Do you currently live in, or plan to relocate to, the specified location?"; some remote roles exclude listed states
- Use: answers arrangement questions and screens postings before applying
- Shape: list with limits
- Policy: auto

### prefs.relocation (essential)
- Ask: Would you relocate for a role? Where, and only with relocation assistance?
- Seen as: "Are you open to relocation for this role?", "If you would need to relocate, type 'relocating'"
- Shape: yes / no with conditions
- Policy: confirm

### prefs.travel (core)
- Ask: What is the most travel you will accept, as a percentage of time?
- Use: answers travel questions and screens postings that mention travel
- Shape: percentage
- Policy: auto

### prefs.schedule (core)
- Ask: Can you work the hours, time zone, shifts, weekends, or on-call schedule a posting describes? How many hours a week can you commit, and how many hours can you overlap with other time zones?
- Seen as: "How many hours per week can you commit?", "Can you overlap at least 4 hours with Pacific time?", "Are you available on weekends?"
- Shape: hours per week; time-zone overlap; yes / no with limits
- Policy: confirm

### prefs.constraints (essential)
- Ask: What rules a job out for you that the questions above do not cover? For example: hours, shifts, weekends, or on-call work; how long a commute you accept, or driving for work; physical demands; industries or kinds of work you avoid; commission-only pay; benefits you need; how many applications a day, or how soon to apply to the same employer again. Record schedule, driving, and pace limits under `prefs.schedule`, `background.drivers-license`, and `prefs.pace` as well, so forms reuse them.
- Use: screens every posting before applying, alongside the other answers; a constraint the person states mid-session is added here at once
- Shape: list, one constraint per line
- Policy: confirm

### employers.avoid (essential)
- Ask: Which employers should never get an application from you: your current employer, recent ones, or any others?
- Use: add each to the blocked employers with its reason (`./resumes employers block <name> --reason <why>`); `queue add` and `app new` refuse them, also under a shorter or longer form of the name
- Shape: employer names, each with a reason
- Policy: confirm

## Timing

### availability.start (essential)
- Ask: How soon could you start after an offer (notice period or earliest date)?
- Seen as: "When is the earliest you would want to start working with us?", "Notice period / availability details"
- Shape: relative period or date
- Policy: auto

## Compensation and employment type

### comp.strategy (essential)
- Ask: How should salary questions be answered: a target base figure or range for each kind of role, wording for free-text fields, and an hourly figure for contract roles?
- Seen as: "What is your expected compensation range?", "What is your desired salary range?", "Do you accept the listed salary range for this position?"; some forms state that "negotiable" or "market" answers are not reviewed
- Shape: number or range per role family; free-text wording
- Policy: confirm

### comp.minimum (essential)
- Ask: What is the lowest base salary or hourly rate you would consider? Postings below it are flagged before applying.
- Shape: number
- Policy: auto

### comp.history (core)
- Ask: How should questions about current or past pay be handled? Many states bar employers from asking; leave the field empty when it is optional.
- Shape: wording
- Policy: confirm

### employment.type (core)
- Ask: Which employment types will you accept: full-time, part-time, contract, contract-to-hire; W-2, 1099, corp-to-corp?
- Shape: list
- Policy: auto

### employment.business-entity (core)
- Ask: If you take corp-to-corp (C2C) contracts, which business do you contract through: its legal name and the state where it is registered? Answer "none" if you contract only as an individual.
- Seen as: "Are you able to work C2C?", "Company name (if C2C)", "Do you have your own corporation or LLC?", "Name of your incorporated business", "Employer of record"
- Shape: legal name and state, or none
- Policy: auto

## Background, history, and conflicts

These appear mostly on Workday, iCIMS, and public-sector forms.

### background.check-consent (core)
- Ask: Are you willing to undergo a background check? (A formal authorization form is signed by the person.)
- Shape: yes / no
- Policy: auto

### background.drug-screen (core)
- Ask: Are you willing to take a pre-employment drug screen?
- Shape: yes / no
- Policy: auto

### background.criminal-history (core)
- Ask: How should conviction-history questions be answered? The answer must be truthful; the person supplies the wording.
- Shape: wording
- Policy: confirm

### background.drivers-license
- Ask: Do you have a valid driver's license and reliable transportation?
- Shape: yes / no
- Policy: auto

### history.government-employment (core)
- Ask: Derived from the profile's employment history: have you worked for a government entity as an employee or contractor? Confirm the wording.
- Seen as: "Do you currently work for or have you ever worked for a U.S. government entity, either as a contractor or employee?" with a follow-up naming the entity
- Shape: yes / no with entity and dates
- Policy: confirm

### conflicts.government-official (core)
- Ask: Are you, or were you in the last five years, a government official, and is a close relative one?
- Seen as: anti-bribery questions about government officials and their relatives
- Shape: yes / no with details
- Policy: confirm

### conflicts.outside-business (core)
- Ask: Do you have outside business activities (advisory, consulting, board roles, side businesses) an employer should know about?
- Seen as: "Do you have any outside business activity(ies)…?"
- Shape: yes / no with details
- Policy: confirm

### obligations.restrictive-agreements (core)
- Ask: Are you bound by a non-compete, non-solicitation, or other agreement that could limit this work?
- Seen as: "Are you currently subject to any non-compete or non-solicitation agreement…?", "…any agreement with a former employer or third party"
- Shape: yes / no with details
- Policy: confirm

### company.relatives (core)
- Ask: When a form asks about relatives or personal relationships at the company, what is the usual answer, and are there companies where it is yes?
- Seen as: "Do you have any family members, relatives, or personal relationships at …?", financial interests in competitors or vendors
- Shape: yes / no per company
- Policy: confirm

### company.prior-employment
- Ask: Derived from the profile and application records; ask when a subsidiary, acquisition, contracting, or prior interview is possible.
- Seen as: "Have you previously been employed at … for any length of time?", "…in any capacity (contractor, intern)", "…or a company acquired by …", "Have you ever interviewed at … before?"; some forms warn that false answers disqualify
- Shape: yes / no with dates
- Policy: auto

### company.referral
- Ask: Did anyone at this company refer you? The answer is none unless the person names a referrer for that employer.
- Seen as: "Were you referred by a current employee?", "Referral name", "Employee referral"
- Shape: name per employer, or none
- Policy: auto

### company.how-heard
- Ask: Derived: the job board or site where the posting was found.
- Shape: choice or text
- Policy: auto

## Voluntary self-identification

Optional, kept apart from hiring decisions, and always open to declining. Record whatever the person chooses; never infer it from a name or resume.

### eeo.gender (essential)
- Ask: How do you want to answer gender on voluntary self-identification forms?
- Shape: choice or decline
- Policy: auto

### eeo.race-ethnicity (essential)
- Ask: How do you want to answer race, ethnicity, and Hispanic or Latino questions?
- Shape: choice or decline
- Policy: auto

### eeo.veteran (essential)
- Ask: How do you want to answer protected-veteran status questions, including "Have you served in the military?" outside the self-identification block?
- Shape: choice or decline
- Policy: auto

### eeo.disability (essential)
- Ask: How do you want to answer the voluntary disability self-identification form, and may its name-and-date line be filled with your legal name and the date?
- Shape: choice or decline; name line yes / no
- Policy: auto

### eeo.sexual-orientation
- Ask: How do you want to answer sexual-orientation or gender-identity questions when they appear?
- Shape: choice or decline
- Policy: auto

## Interviews, consent, accommodations

### accommodations.request (core)
- Ask: When a form asks whether you need accommodations for interviews, tests, or scheduling, what should it say?
- Shape: wording
- Policy: confirm

### interviews.recorded-video (core)
- Ask: Do you consent to one-way recorded video interviews?
- Shape: yes / no
- Policy: confirm

### interviews.ai-assessment (core)
- Ask: Do you consent to AI-scored assessments or AI interview tools when an employer asks?
- Shape: yes / no
- Policy: confirm

### interviews.ai-notetaker (core)
- Ask: Do you consent to AI notetakers transcribing interviews?
- Seen as: "As part of our interview process, we may use AI notetakers…"
- Shape: yes / no
- Policy: auto

### prefs.ai-screening-opt-out (core)
- Ask: When a posting offers to route your application to human review instead of AI screening, should you opt out of AI screening?
- Shape: yes / no
- Policy: auto

### consent.required-terms (essential)
- Ask: When a form requires accepting a privacy notice, the application system's terms, or an arbitration agreement before it can be submitted, should the agent accept on your behalf?
- Seen as: "Do you consent to … processing your personal information…?", "Please review and acknowledge … candidate privacy policy", "Please confirm receipt of the above linked global data privacy notice and US arbitration agreement"
- Shape: yes / no, optionally excluding arbitration agreements
- Policy: confirm

### consent.sms (core)
- Ask: Do you want recruiting texts or WhatsApp messages when a form offers to opt in?
- Shape: yes / no
- Policy: auto

### consent.talent-pool
- Ask: Should employers keep your application for other openings, add you to a talent community, or share your resume with partners?
- Shape: yes / no for each
- Policy: auto

## AI use

### ai.disclosure (core)
- Ask: When a form asks whether or how AI helped prepare the application, what truthful wording do you want?
- Seen as: "Which of the following best describes how you use AI tools today?", own-work attestations, AI-use scales
- Shape: choice or wording
- Policy: confirm

### ai.tools-usage
- Ask: Derived from the evidence file's AI tools section; confirm the wording once.
- Seen as: "What AI tools are you currently using today and how are you using them?"
- Shape: text
- Policy: confirm

### ai.policy-acknowledgement
- Ask: How should acknowledgement checkboxes for an employer's AI policy be handled?
- Seen as: "AI policy for application", "AI policy for interviewers", "I understand that … may use AI tools to assist in the application and interview process"
- Shape: acknowledgement
- Policy: confirm

## Education and experience

### education.gpa
- Ask: Do you want to share a GPA when a form asks? Which one?
- Shape: number or leave blank
- Policy: confirm

### experience.years-total (essential)
- Ask: How many years of professional experience should forms state, overall and for the kind of role being applied to?
- Shape: numbers with the basis for each
- Policy: confirm

### experience.years.<skill>
- Ask: Derived from dated evidence the first time a skill comes up (for example Python, Rust, or a named ERP), as the job-application skill's forms reference describes, and recorded under this id with the skill name, the figure, and its basis, so every later form gives the same figure; the person corrects it from the inbox. When nothing dated shows the skill, the person is asked once, in the next batch.
- Shape: number with basis
- Policy: auto

### experience.people-management
- Ask: Have you managed people directly? How many, and for how long?
- Shape: number with basis
- Policy: confirm

### skills.languages-spoken (core)
- Ask: Which languages do you speak, and at what level? Propose the languages of the person's education and work, at professional fluency.
- Seen as: "English proficiency", "Are you fluent in English?", "Languages you speak"
- Shape: list with levels
- Policy: auto

## Documents and references

### documents.references
- Ask: Who are your references, and have they agreed to be contacted? Provide only people the person names.
- Shape: list
- Policy: ask

### documents.additional
- Ask: Transcripts, certifications, writing samples, or portfolios requested by a posting: which file, if any?
- Shape: file path or none
- Policy: ask

## Attestations

### attest.accuracy
- Ask: Certification that the application is accurate and complete; every answer being true is what makes it checkable.
- Shape: checkbox
- Policy: auto

### attest.at-will
- Ask: Acknowledgement of at-will employment or similar employer statements; follows the `consent.required-terms` answer.
- Shape: checkbox
- Policy: confirm

### attest.signature
- Ask: Typed-name electronic signatures use the person's legal name.
- Shape: the person's full legal name
- Policy: auto
