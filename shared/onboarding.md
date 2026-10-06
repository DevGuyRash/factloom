---
type: onboarding-catalog
---

# Onboarding catalog

Questions that job applications ask, written once for everyone. Session onboarding asks the entries marked **essential** first, before the first application: they settle what to apply for and the questions nearly every form asks. It asks the entries marked **core** in batches once applying has started (all of them, when the person prefers to finish onboarding first). The rest go on the waiting list the first time a form needs them and reach the person in the next batch of questions. The person's saved answers cover any of these. Answers the person chooses to keep are saved in their `answers` file under the same ids.

Each entry lists what to ask the person, phrasings seen on forms, the answer shape, and the default policy (`auto`, `confirm`, `ask`, or `person`, defined in the job-application skill). The person may choose a different policy for their own answer. Where an honest answer comes in degrees (travel, office days, commute, hours, on-call, physical demands, contract length, pay), the shape is a limit or a range rather than yes or no, so one answer settles whatever threshold a form names.

## How sessions run

### prefs.pace
- Ask: Any limit on applications per day, or on how soon to apply to the same employer again? No limit unless the person sets one.
- Shape: number per day; days between applications to one employer
- Policy: auto

### prefs.min-fit (essential)
- Ask: How good a match should a posting be before you apply? Each posting gets a fit score from 0 to 100 from the must-haves you meet, seniority, preferred skills, pay, arrangement, and location. Whatever the score, a posting where you meet fewer than half the requirements is skipped, unless you name another share (for example "65, must-haves 40%"). Offer: 50 (anything you could plausibly do, stretch roles included), 65 (solid matches, the default), or 80 (strong matches only).
- Use: `./resumes score` reports whether a posting clears it; a posting below it is skipped with its score as the reason
- Shape: number from 0 to 100; optionally the share of must-haves to meet
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
- Ask: When a site emails a verification code or link, who reads it: you, or the agent? The agent needs a route to your mailbox (the host's mail connector or plugin, a webmail tab signed in to its browser, a mail MCP server, or a mail client such as himalaya) and reads only the newest message from that site.
- Shape: choice: the person or the agent
- Policy: confirm

### prefs.role-focus (core)
- Ask: Of your target roles, which matter most right now? The agent searches and applies for those first, and comes back to the others when they run dry. Change it any time.
- Shape: roles in order, or "all equally"
- Policy: auto

### mail.application-replies (core)
- Ask: May the agent check your mailbox (or a signed-in webmail tab) for mail about your applications, at the start of each activation and after each pass: confirmations, rejections, follow-up questions, interview invitations, recruiter messages? It searches only for the employers and sites you applied to, records what comes back, completes follow-up forms from your answers, and tells you at once about an interview invitation or a recruiter message.
- Shape: yes / no
- Policy: confirm

### mail.replies (core)
- Ask: When an employer or recruiter writes back, may the agent answer for you where your answers already settle it (your interest, times within your interview availability, pay within your answers, a resume or link you would send anyway), telling you what it sent? Or should it only tell you? It may also book interview slots within your availability, if you say so. Offers, negotiations, contracts, and anything your answers do not settle always come to you.
- Seen as: "Are you still interested in this role?", "Please share your availability for a 30-minute call", "What are your rate expectations?", "Could you send your updated resume?"
- Shape: choice: tell me only; answer what my answers settle; answer and book interviews within my availability
- Policy: confirm

### availability.interviews (core)
- Ask: When can employers reach you for calls and interviews (days, hours, and time zone), and how much notice do you need?
- Seen as: "What is your availability for an interview?", "Please list a few times that work for you this week", "Preferred contact hours"
- Shape: days and hours with time zone; notice needed
- Policy: confirm

### mail.receipts (core)
- Ask: Once the agent has done what an application email needs (a receipt checked, a rejection recorded, a code used, a job alert's postings queued, a requested form completed, a reply sent), may it file the message, into a folder or label you name or the archive, so your inbox keeps only what needs you? Messages that need you stay until you have seen them, and nothing is ever deleted.
- Shape: yes, into a folder or label (its name); yes, to the archive; no
- Policy: confirm

### browser.tabs (core)
- Ask: The agent closes the browser tabs it opens once it is done with them. May it also close tabs you opened yourself, once their posting is worked (applied, held, or skipped, with its link saved in the record)?
- Shape: yes / no
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

### contact.address (essential)
- Ask: Which mailing address should forms use? It is kept only on this computer, in a file git ignores, never in the repository, and goes only into address fields a form requires; optional ones stay empty.
- Seen as: "Street address", "Address line 1", "ZIP code", "What is the address from which you plan on working?"
- Shape: street, city, state, ZIP
- Stored: local
- Policy: confirm

### contact.email-alternate (core)
- Ask: Some forms reject an email address (uncommon or privacy-focused domains, aliases). Which other address may such a form get, or should the application wait for you?
- Seen as: "Please enter a valid email address" on an address that is valid
- Shape: email address, or none
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

### work-auth.other-citizenship (core)
- Ask: Do you hold citizenship of any other country, now or by birth? Which?
- Seen as: "Do you hold dual citizenship?", "List all countries of citizenship", "Are you a citizen of any country other than the U.S.?"
- Shape: no, or the countries
- Policy: confirm

### work-auth.export-control
- Ask: Derived from the citizenship category: are you a "U.S. person" for export-control purposes, and do you hold citizenship in any sanctioned country?
- Seen as: export-control (ITAR/EAR) information requests, sanctioned-country citizenship questions
- Shape: yes / no
- Policy: confirm

### work-auth.clearance (core)
- Ask: Do you hold an active security clearance or public-trust determination, and would you be willing to undergo the government background investigation to obtain one? These roles often require U.S. citizenship (ask `work-auth.citizenship-category` with this) and sometimes years of U.S. residence.
- Seen as: "Ability to obtain a Public Trust", "Active Secret clearance required", "U.S. citizens only", "Must be able to pass a federal background investigation"
- Shape: clearance or public-trust level, or none; willing yes / no
- Policy: auto

### eligibility.age-18 (essential)
- Ask: Are you at least 18 years old?
- Seen as: "Are you 18 years of age or older?", "Are you at least 18?"
- Shape: yes / no
- Policy: auto

### eligibility.essential-functions (essential)
- Ask: Forms ask whether you can perform the job's essential functions, with or without reasonable accommodation, and some ask about physical demands (lifting, standing, driving). What should they say, and are there demands you cannot meet?
- Seen as: "Are you able to perform the essential functions of this position with or without reasonable accommodation?", "Can you lift up to 25 pounds?", "This role requires standing for long periods"
- Shape: yes / no, with limits as figures (the most weight to lift, hours standing, driving)
- Policy: confirm

## Location, arrangement, travel

### prefs.work-arrangement (essential)
- Ask: Which arrangements will you accept (remote, hybrid, on-site), and for hybrid or on-site, which metro areas, how many office days a week at most, and the longest commute (minutes or miles)?
- Seen as: "This role requires in-office work three days per week… do you acknowledge and agree?", "Do you currently live in, or plan to relocate to, the specified location?", "Are you able to commute to our office?"; some remote roles exclude listed states or require residence in one
- Use: answers arrangement questions and screens postings before applying
- Shape: arrangements accepted, each with its limits: metro areas, office days a week at most, longest commute
- Policy: auto

### prefs.relocation (essential)
- Ask: Would you relocate for a role? Where (places in order of preference), how soon, and only with relocation assistance?
- Seen as: "Are you open to relocation for this role?", "If you would need to relocate, type 'relocating'"
- Shape: places, or none, each with its conditions (assistance, timeline)
- Policy: confirm

### prefs.travel (essential)
- Ask: How much travel will you accept: the most, as a share of time or days a month (offer none, an annual team meetup, occasional day trips, up to 10%, 25%, 50%); whether overnight and international trips are fine; and any condition (for example "up to 10%, as long as the role is mostly remote")? When the answer is none, ask once whether an annual meetup or an occasional trip is fine too, since many remote postings mention one.
- Seen as: "Are you willing to travel up to 25% of the time?", "This role requires occasional travel to client sites", "Travel: 0–25% / 25–50% / 50%+", "Are you able to travel overnight?"
- Use: answers travel questions and screens postings that mention travel: a stated share above the most is a conflict; "occasional", "as needed", or an annual team meetup is not, unless the person's answer says so
- Shape: the most (share of time or days a month); overnight and international yes / no; conditions
- Policy: auto

### prefs.schedule (core)
- Ask: How many hours a week can you commit (fewest and most), which hours and time zones can you work and overlap with, and how often at most will you work shifts, weekends, on-call, or overtime?
- Seen as: "How many hours per week can you commit?", "Can you overlap at least 4 hours with Pacific time?", "Are you available on weekends?", "This role includes a one-week on-call rotation every six weeks"
- Shape: hours a week (fewest and most); working hours and time-zone overlap; how often at most for shifts, weekends, on-call, and overtime
- Policy: confirm

### prefs.remote-setup (core)
- Ask: For remote work, what should forms say about your setup: a quiet workspace, your internet speed, your own computer, a webcam, and whether you accept monitoring software on a company device?
- Seen as: "Do you have a dedicated home office?", "Do you have reliable internet of at least 25 Mbps?", "Are you comfortable with time-tracking or monitoring software?"
- Shape: yes / no for each; internet speed as a figure
- Policy: confirm

### prefs.constraints (essential)
- Ask: What rules a job out for you that the questions above do not cover? For example: hours, shifts, weekends, or on-call work; how long a commute you accept, or driving for work; physical demands; industries or kinds of work you avoid (for example data-annotation or AI-training gigs paid per task, or sales roles); commission-only pay; benefits you need; how many applications a day, or how soon to apply to the same employer again. Record schedule, driving, and pace limits under `prefs.schedule`, `background.drivers-license`, and `prefs.pace` as well, so forms reuse them.
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

### comp.minimum (essential)
- Ask: What is the least you would accept: a base salary, and an hourly rate for hourly or contract work (with a separate rate for 1099 or corp-to-corp contracts when it differs)? Postings whose pay cannot reach it are skipped, and no form is ever given a lower figure (for part-time or short contracts, see `employment.engagement`).
- Seen as: "Minimum salary requirement", "Lowest acceptable rate"
- Shape: salary; hourly rate; contract rate when it differs
- Policy: auto

### comp.strategy (essential)
- Ask: What pay should forms ask for: your target, the figure you want rather than the least you would take, as a base salary and as an hourly rate, for each kind of role? And how should it meet a range the posting states? Offer the default: the target when the range includes it, the range's midpoint when the range starts above the target, and the range's top when it ends below the target but still reaches the minimum. Add wording for free-text fields.
- Seen as: "What is your expected compensation range?", "What is your desired salary range?", "Desired hourly rate", "Salary expectations", "Do you accept the listed salary range for this position?"; some forms state that "negotiable" or "market" answers are not reviewed
- Shape: target salary and hourly rate per role family; how to meet a posted range; free-text wording
- Policy: confirm

### comp.project-rate
- Ask: When a posting asks for a fixed price or a project bid rather than a rate, how should it be priced: an hourly rate times an estimate, or a figure you give?
- Seen as: "Proposed project fee", "Your bid for this project", "Flat rate"
- Shape: rule or figure
- Policy: ask

### comp.history (core)
- Ask: What should forms say about your current or most recent pay: a figure you are comfortable sharing (salary or hourly), or decline where the form allows? Many states bar employers from asking. Optional fields stay empty; when a form requires a figure and you have declined, the application waits for you.
- Seen as: "Current salary", "Current base compensation", "Most recent salary", "Current hourly rate"
- Shape: salary or hourly figure, or decline, with wording
- Policy: confirm

### employment.type (essential)
- Ask: Which employment types will you accept: full-time, part-time, contract, contract-to-hire; W-2, 1099, corp-to-corp?
- Shape: list
- Policy: auto

### employment.engagement (core)
- Ask: For contract work: what is the shortest contract you would take, how many hours a week (fewest and most), and does your hourly minimum hold for part-time or short contracts too?
- Seen as: "This is a 3-month contract", "10 to 20 hours per week", "Are you available full time for the duration of the project?"
- Shape: shortest length; hours per week; minimum rule
- Policy: confirm

### employment.exclusivity (core)
- Ask: When an employer or client asks you to work only for them while the job or contract lasts (no other job, clients, or full-time engagement), will you agree? Separately for employee roles and for contracts, with any exceptions (a business you keep running, small side work).
- Seen as: "Can you commit on a fully dedicated, full-time basis?", "You may not hold another job or full-time engagement during this contract", "Will you continue to work for your current employer?", "Are you currently engaged with another client full-time?"
- Shape: yes / no for employee roles and for contracts; exceptions
- Policy: confirm

### prefs.agencies (core)
- Ask: Many contract roles come through staffing or recruiting firms that submit you to a client, sometimes without naming it, and one client role is often posted by several firms. Should the agent apply through such firms: any, only those that name the client, or none (direct employers only)? A client gets one submission per role either way.
- Seen as: "Has another agency submitted you for this role?", "Do you give us the right to represent you?", "Who is the end client?"
- Shape: choice
- Policy: confirm

### employment.business-entity (core)
- Ask: If you take corp-to-corp (C2C) contracts, which business do you contract through: its legal name and the state where it is registered? Answer "none" if you contract only as an individual.
- Seen as: "Are you able to work C2C?", "Company name (if C2C)", "Do you have your own corporation or LLC?", "Name of your incorporated business", "Employer of record"
- Shape: legal name and state, or none
- Policy: auto

## Background, history, and conflicts

These appear mostly on Workday, iCIMS, and public-sector forms. The essential ones form the screening batch asked before the first application, in one message with one line per question; the rest follow with the core questions.

### background.check-consent (essential)
- Ask: Are you willing to undergo a pre-employment background check, including fingerprinting where an employer requires it (common in public-sector, healthcare, and education roles)? (A formal authorization form is signed by the person.)
- Seen as: "Are you willing to submit to a background check?", "Do you consent to a background check?", "This position requires a background check. Are you comfortable with that?", "Are you willing to be fingerprinted?", "Public Trust background investigation"
- Shape: yes / no
- Policy: auto

### background.drug-screen (essential)
- Ask: Are you willing to take a pre-employment drug test? Some forms ask instead whether you can pass one: what should those say?
- Seen as: "Are you willing to take a drug test?", "Are you willing to submit to drug testing?", "Can you pass a pre-employment drug screen?", "This position requires a drug screen"
- Shape: willing: yes / no; can pass: yes / no, or left for the person
- Policy: auto

### background.criminal-history (essential)
- Ask: How should conviction-history questions be answered? The answer must be truthful; the person supplies the wording, or asks to answer each one themselves. (Many places bar employers from asking on the first application; a form that asks anyway still gets the truthful answer.)
- Seen as: "Have you ever been convicted of a felony?", "Have you been convicted of a crime in the last seven years?"
- Shape: wording, or the person answers each one
- Policy: confirm

### history.contact-employer (essential)
- Ask: May employers contact your current employer to verify your employment, and your past employers? Many people answer "not my current employer until an offer".
- Seen as: "May we contact your current employer?", "May we contact this employer for a reference?"
- Shape: current employer: yes / no / after an offer; past employers: yes / no
- Policy: auto

### background.credit-check (core)
- Ask: Are you willing to undergo a credit check, which some finance, cash-handling, and security-sensitive roles require?
- Seen as: "Do you consent to a credit check?", "This position requires a credit check"
- Shape: yes / no
- Policy: auto

### background.drivers-license (core)
- Ask: Do you have a valid driver's license and reliable transportation, and would you consent to a driving-record check for a role that involves driving?
- Seen as: "Do you have a valid driver's license?", "Do you have reliable transportation?", "Will you consent to a motor vehicle record check?"
- Shape: yes / no for each
- Policy: auto

### background.health-screening (core)
- Ask: Some employers, mostly in healthcare, education, and food service, require vaccinations, a tuberculosis test, or a physical before starting. Are you willing, and are there exceptions to note?
- Seen as: "Are you willing to comply with the vaccination requirements of this role?", "Are you willing to complete a pre-employment physical?"
- Shape: yes / no with exceptions
- Policy: confirm

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

### obligations.future-agreements (core)
- Ask: If hired, will you sign a confidentiality agreement (NDA), an invention-assignment agreement, or a non-compete or non-solicitation agreement? Each on its own line.
- Seen as: "Are you willing to sign a non-disclosure agreement?", "Will you sign our Proprietary Information and Inventions Agreement?", "Would you be willing to sign a non-compete?"
- Shape: yes / no for each
- Policy: confirm

### history.omitted-roles (core)
- Ask: Is there a job or a gap you leave off your resumes? A form that asks for your complete employment history, or an employment verification, lists it truthfully. What should it say, or should those applications wait for you?
- Shape: roles to list on full-history forms, or "hold for me"
- Policy: confirm

### history.terminated (core)
- Ask: Have you ever been terminated or asked to resign? Forms ask it plainly; the answer must be truthful, and you supply any explanation, or ask to answer each one yourself.
- Seen as: "Have you ever been discharged or asked to resign from a position?", "Reason for leaving"
- Shape: yes / no, with wording; or the person answers each one
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

### interviews.assessments (core)
- Ask: Are you willing to complete skills assessments as part of an application: timed online tests, take-home tasks, and how long a take-home you would accept unpaid?
- Seen as: "Are you willing to complete a skills assessment?", "This role includes a take-home exercise"
- Shape: yes / no for each; the longest unpaid take-home, in hours
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
- Ask: Applications often require accepting terms before they can be sent: a privacy notice or consent to process your data, the applicant system's or job board's terms (sometimes with an account or talent profile it registers), an accuracy certification signed with your typed name, AI-screening or at-will acknowledgements, and sometimes an arbitration agreement. Should the agent accept these for you when an application requires them? Any kind to exclude (arbitration is the usual one)? Optional extras follow `consent.sms` and `consent.talent-pool`, and anything that costs money or binds you beyond applying waits for you.
- Seen as: "Do you consent to … processing your personal information…?", "Please review and acknowledge … candidate privacy policy", "Please confirm receipt of the above linked global data privacy notice and US arbitration agreement", "I agree to the Terms of Use and Privacy Policy", "By clicking Apply, you agree to the Terms and Privacy Notice", "Applicant agreement: I certify that the information is true and complete…", "By submitting, you agree to be contacted about this application by phone or text"
- Shape: yes / no, with the kinds excluded
- Policy: confirm

### consent.sms (core)
- Ask: Do you want recruiting texts, calls, or WhatsApp messages beyond this application when a form offers to opt in?
- Shape: yes / no
- Policy: auto

### consent.talent-pool (core)
- Ask: Should employers keep your application for other openings, add you to a talent community, send job alerts, share your resume with partners, keep or reuse it for other purposes (research, grants, proposals), or name you in proposals to their clients? Each defaults to no.
- Seen as: "May we keep your information for future opportunities?", "Join our talent community", "We may share your profile with our partners", "May we name you as key personnel in proposals?"
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

### experience.counting-basis (core)
- Ask: When a form asks for years of experience with a tool or skill, may hands-on time outside paid jobs count (personal projects, open source, a home lab, school), or only paid work? Forms that say "professional" or "work" experience get paid work either way.
- Shape: paid work only; or paid work plus dated hands-on projects, each figure kept with its basis
- Policy: confirm

### experience.unlisted-skills (core)
- Ask: When a form asks about a skill, tool, or certification your records do not show at all, should the agent answer none (0 years, no), hold the application for you (once per skill), or skip postings that require it? Until you answer, forms get none, and each such skill goes to your inbox for correction. A figure is never invented.
- Seen as: "How many years of work experience do you have with <tool>?" as a required number field
- Shape: choice
- Policy: confirm

### credentials.held (core)
- Ask: Which degrees (completed or in progress, with dates), certifications (issuer, year, and whether active), and licenses do you hold? A form asking about a credential not listed gets no.
- Seen as: "Highest level of education completed", "How many <vendor> certifications do you hold?", "Do you hold an active <license>?"
- Shape: list, or none
- Policy: auto

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

### documents.references (essential)
- Ask: Do you have references to include when a form asks for them? For each: name, relationship, company, phone, email, and whether they have agreed to be contacted. Only people you name, and only those who agreed; their details are kept only on this computer, in a file git ignores. And when a form asks only whether you could provide references later, or someone who can confirm your employment dates, what should it say?
- Seen as: "Professional references", "Reference name", "Reference phone", "Please provide three references", "References available upon request?", "If selected, can you provide a reference who can confirm the dates of your most recent engagement?"
- Shape: list of references with consent, or none; can provide later: yes / no
- Stored: local
- Policy: confirm

### documents.additional
- Ask: Transcripts, certifications, writing samples, or portfolios requested by a posting: which file, if any?
- Shape: file path or none
- Policy: ask

### links.public-work (core)
- Ask: Which public links may forms get when they ask for examples of your work: a portfolio, GitHub, live sites, demos? Which may not be shared? A required field for a kind of link you have not listed gets the listed link that truthfully fits it best, or "None" where the field takes text, so it does not hold the application.
- Seen as: "Portfolio URL", "GitHub profile", "Link to a live site you built", "Demo or work sample"
- Shape: list of links with what each shows; links not to share
- Policy: confirm

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
