// Single source of truth for the repository's document model. Every tool (checker, generators,
// pipeline commands) imports these definitions instead of restating them.

/** Frontmatter `type` values and the fields each one requires. */
export const DOC_TYPES = {
  profile: ["person", "name", "apply"],
  answers: ["person"],
  "session-answers": ["person"],
  private: ["person"],
  "session-credentials": ["person"],
  evidence: ["person"],
  inbox: ["person"],
  notes: ["person"],
  stories: ["person"],
  queue: ["person"],
  searches: ["person"],
  employers: ["person"],
  "run-log": ["person", "started"],
  dashboard: ["person"],
  "resume-guide": ["person", "status", "use_for"],
  application: ["person", "company", "role", "status", "updated"],
  posting: ["person", "company", "role"],
  "cover-letter": ["person"],
  "follow-up": ["person"],
  "thank-you": ["person"],
  "interview-prep": ["person"],
  "keyword-report": ["person"],
  "tailored-resume": ["person", "variant"],
  company: ["company"],
  "onboarding-catalog": [],
  "site-notes": [],
} as const satisfies Record<string, readonly string[]>;

export type DocType = keyof typeof DOC_TYPES;
export const isDocType = (t: unknown): t is DocType => typeof t === "string" && t in DOC_TYPES;

export const APPLY = ["enabled", "disabled"] as const;
export const GUIDE_STATUS = ["ready", "needs-review"] as const;
export const APPLICATION_STATUS = [
  "drafted", "blocked", "submitted", "skipped", "withdrawn", "rejected", "interviewing", "offer", "closed",
  "hired", "started", "not-hired", "work-not-available",
] as const;
/** Built-ins remain discoverable; explicit custom statuses use a lowercase hyphenated slug. */
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number] | (string & {});
export const APPLICATION_LABEL = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Outcomes that close application reminders while retaining their pending fields and history. */
export const TERMINAL_APPLICATION_STATUS: readonly ApplicationStatus[] = ["rejected", "not-hired", "work-not-available", "withdrawn", "closed", "hired", "started", "skipped"];
export const OUTCOME_STATUS = ["rejected", "interviewing", "offer", "withdrawn", "closed", "hired", "started", "not-hired", "work-not-available"] as const;
export const APPLICATION_LOCATION_FIELDS = ["country", "address", "zip", "city", "state"] as const;
export const APPLICATION_CONTACT_FIELDS = ["title", "first", "last", "phone", "email", "website"] as const;
export type EmployerLocation = Partial<Record<(typeof APPLICATION_LOCATION_FIELDS)[number], string>>;
export type EmployerContact = Partial<Record<(typeof APPLICATION_CONTACT_FIELDS)[number], string>>;
/** Optional additions to existing application records. Missing/null values mean unknown, never inferred. */
export type ApplicationDetails = {
  address_of_record?: EmployerLocation;
  alternate_location?: EmployerLocation;
  contact_method?: string;
  contact?: EmployerContact;
  date_contacted?: string;
  hired?: string;
  start_date?: string;
  started?: string;
};
export const APPLICATION_EVENT_KINDS = ["created", "details-updated", "contacted", "submitted", "held", "skipped", "reopened", "pending-resolved", "interview-scheduled", "interview-rescheduled", "interview-cancelled", "interview-attended", "hired", "start-scheduled", "started", "note"] as const;
/** Attributed feedback is input to reconciliation, never a proven hiring cause or an automatic edit. */
export const OUTCOME_FEEDBACK_RECONCILIATION = {
  generic: "no-change-required", visibility: "recover-supported-evidence", specific: "review-feedback",
} as const;
export type OutcomeFeedback = {
  kind: keyof typeof OUTCOME_FEEDBACK_RECONCILIATION;
  cause: "unknown";
  reconciliation: (typeof OUTCOME_FEEDBACK_RECONCILIATION)[keyof typeof OUTCOME_FEEDBACK_RECONCILIATION];
  text?: string; source?: string; evidence_refs?: string[];
};
/** on is when it happened; recorded_at is when we learned/recorded it. at is an interview's scheduled time. */
export type ApplicationEvent = {
  kind: string; on: string; recorded_at: string; status?: ApplicationStatus; note?: string;
  at?: string; replaces?: string; round?: string; contact_method?: string; start_date?: string; feedback?: OutcomeFeedback;
};
/** Statuses that mean the employer answered, and those that mean an interview happened. */
export const RESPONDED_STATUS: readonly ApplicationStatus[] = ["rejected", "interviewing", "offer", "closed", "hired", "started", "not-hired", "work-not-available"];
export const INTERVIEW_STATUS: readonly ApplicationStatus[] = ["interviewing", "offer"];
export const QUEUE_STATUS = ["queued", "in-progress", "done"] as const;
export const POLICIES = ["auto", "confirm", "ask", "person"] as const;

/** Enumerated frontmatter fields, keyed by document type. */
export const ENUMS: ReadonlyArray<{ type: DocType; field: string; values: readonly string[] }> = [
  { type: "profile", field: "apply", values: APPLY },
  { type: "resume-guide", field: "status", values: GUIDE_STATUS },
  { type: "application", field: "status", values: APPLICATION_STATUS },
];

/** Answers whose values stay out of committed records (records name the id only). */
export const SENSITIVE_ANSWER_PREFIXES = ["eeo.", "background.criminal-history", "background.drug-screen", "history.terminated", "background.health-screening", "eligibility.essential-functions", "accommodations.", "contact.address", "documents.references"] as const;

export const RESUME_EXTENSIONS = [".pdf", ".docx"] as const;
/** Text that marks a draft or sample; it never belongs in a sendable resume or letter. */
export const DRAFT_MARKERS = /\b(?:is|are|entirely|purely|all) fictional\b|\bfictional (?:person|candidate|resume|sample|data|results)\b|placeholder|lorem ipsum|class presentation|\bTODO\b|\bTBD\b|xx\/xx/i;
/** `YYYY-MM-DD_company-slug_role-slug` */
export const APPLICATION_DIR = /^\d{4}-\d{2}-\d{2}_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_TRACKED_BYTES = 20 * 1024 * 1024;

/** Conventional file names for new documents; readers still locate files by `type`. */
export const FILE_NAMES = {
  record: "record.md",
  posting: "posting.md",
  coverLetter: "cover-letter.md",
  followUp: "follow-up.md",
  thankYou: "thank-you.md",
  interviewPrep: "interview-prep.md",
  keywordReport: "keywords.md",
  tailoredResume: "resume-tailored.yaml",
  queue: "queue.md",
  searches: "searches.md",
  employers: "employers.md",
  stories: "stories.md",
  dashboard: "dashboard.md",
  sessionAnswers: "session.local.md",
  sessionCredentials: "accounts.local.md",
} as const;

/** Scam screening is independent of hiring status. Automated findings are review requests, not fraud verdicts. */
export const SCAM_STATES = ["unreviewed", "needs-review", "cleared", "confirmed-scam"] as const;
export type ScamState = (typeof SCAM_STATES)[number];
export type ScamFinding = {
  id: string; code: string; reason: string; source: string; observed_at: string;
  disposition: "open" | "false-positive" | "confirmed-scam";
};
export type ScamAssessment = {
  fingerprint: string; context: "posting" | "email"; source: string; observed_at: string;
  claimed_sender?: string; sender_domain?: string; reply_to_domain?: string; link_domains: string[]; finding_ids: string[];
};
export type ScamVerification = { application_url?: string; official_url: string; trusted_domains: string[]; verified_at: string; reason: string };
export type ScamResolution = {
  decision: "cleared" | "false-positive" | "confirmed-scam"; reason: string; source: string; recorded_at: string; finding_ids: string[];
  verification?: ScamVerification;
};
export type ScamReview = {
  state: ScamState; findings: ScamFinding[]; assessments: ScamAssessment[]; reviews: ScamResolution[];
  verification?: ScamVerification;
};
