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
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];
/** Statuses that mean the employer answered, and those that mean an interview happened. */
export const RESPONDED_STATUS: readonly ApplicationStatus[] = ["rejected", "interviewing", "offer", "closed"];
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
export const SENSITIVE_ANSWER_PREFIXES = ["eeo.", "background.criminal-history", "accommodations.", "contact.address"] as const;

export const RESUME_EXTENSIONS = [".pdf", ".docx"] as const;
/** Text that marks a draft or sample; it never belongs in a sendable resume or letter. */
export const DRAFT_MARKERS = /fictional|placeholder|lorem ipsum|class presentation|\bTODO\b|\bTBD\b|xx\/xx/i;
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
