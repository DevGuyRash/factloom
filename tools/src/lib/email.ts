// Email helpers: pure text in, no mailbox access. Classifies an email's purpose and pulls out
// verification codes/links, for reuse by the job-application skill wherever it already has message text.
export type EmailCategory = "verification" | "confirmation" | "rejection" | "interview" | "job-alert" | "other";
export type Classification = { category: EmailCategory; confidence: number; matched: string[] };

type Rule = { category: EmailCategory; patterns: RegExp[] };

// Order matters: checked top to bottom, first category with any match wins.
const RULES: Rule[] = [
  {
    category: "interview",
    patterns: [
      /\binterview invitation\b/i, /schedule\s+(a|an|your)\s+(interview|call|chat)/i,
      /\bphone screen\b/i, /\bnext steps?\b.{0,40}\binterview\b/i, /would like to (set up|schedule)/i,
      /\bonsite\b.{0,20}\binterview\b/i, /book (a|your) (time|slot) (for|with)/i,
    ],
  },
  {
    category: "rejection",
    patterns: [
      /\bunfortunately\b/i, /not moving forward/i, /decided not to proceed/i, /other candidates?/i,
      /not (been )?selected/i, /position has been filled/i, /pursue other applicants/i, /will not be (moving|proceeding)/i,
    ],
  },
  {
    category: "verification",
    patterns: [
      /verify your email/i, /verification code/i, /confirm your email address/i, /one[- ]time (code|password|pin)/i,
      /\botp\b/i, /email verification/i, /security code/i,
    ],
  },
  {
    category: "confirmation",
    patterns: [
      /application (has been|was) received/i, /thank you for applying/i, /we('| h)ave received your application/i,
      /successfully submitted/i, /application (is )?complete/i, /received your application/i,
    ],
  },
  {
    category: "job-alert",
    patterns: [
      /job alert/i, /new jobs? (that )?match/i, /recommended jobs?/i, /jobs? for you/i,
      /based on your (search|profile)/i, /\bjob matches?\b/i, /jobs? you (might|may) (like|be interested)/i,
    ],
  },
];

/** Classifies an email's purpose from keyword/regex rules, with a confidence in [0, 1]. */
export function classifyEmail(text: string): Classification {
  for (const rule of RULES) {
    const matched = rule.patterns.filter((p) => p.test(text)).map((p) => p.source);
    if (matched.length) return { category: rule.category, confidence: Math.min(1, matched.length / Math.max(2, rule.patterns.length / 2)), matched };
  }
  return { category: "other", confidence: 0.3, matched: [] };
}

export type Codes = { codes: string[]; links: string[] };

// The code follows its keyword on the same line, past a few filler characters (": ", " is "), and
// contains a digit, so words such as "Your" after a subject line are never read as codes.
const CODE_NEAR_KEYWORD = /\b(?:code|pin|otp|passcode)\b[^\n\d]{0,16}?\b((?=[a-z]*\d)[a-z0-9]{4,8})\b/gi;
const STANDALONE_DIGITS = /\b(\d{6})\b/g;
const LINK = /https?:\/\/[^\s<>()"'\]]+/gi;
const LINK_HINT = /verify|confirm|activate|unsubscribe|token=|code=|auth/i;

/** Verification codes and links found in free text (no mailbox access; pure parsing). */
export function extractCodes(text: string): Codes {
  const codes = new Set<string>();
  for (const m of text.matchAll(CODE_NEAR_KEYWORD)) codes.add(m[1].toUpperCase());
  if (codes.size === 0 && /\bcode\b|\bverify\b|\botp\b/i.test(text)) {
    for (const m of text.matchAll(STANDALONE_DIGITS)) codes.add(m[1]);
  }
  const links = new Set<string>();
  for (const m of text.matchAll(LINK)) {
    const url = m[0].replace(/[.,);\]]+$/, "");
    if (LINK_HINT.test(url)) links.add(url);
  }
  return { codes: [...codes], links: [...links] };
}
