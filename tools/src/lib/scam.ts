// Local screening of already-authorized text. Never fetches URLs, reads mail, follows instructions
// inside a message, or turns a heuristic into a fraud verdict. Evidence stays on its application.
import { createHash } from "node:crypto";
import { stamp } from "./repo.ts";
import { normalizeAt } from "./when.ts";
import { SCAM_STATES, type ScamAssessment, type ScamFinding, type ScamReview, type ScamState } from "./schema.ts";

export type ScamInput = {
  text: string; context: "posting" | "email"; source: string;
  url?: string; sender?: string; replyTo?: string;
};
const empty = (): ScamReview => ({ state: "unreviewed", findings: [], assessments: [], reviews: [] });

/** Exact verified hostname or true subdomain only; never guessed last-two-label/public-suffix matching. */
export function trustedHost(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}
export function hostOf(url: string): string | undefined {
  try { const u = new URL(url); return ["https:", "http:"].includes(u.protocol) ? u.hostname.toLowerCase().replace(/\.$/, "") : undefined; } catch { return undefined; }
}
export function domain(value: string): string {
  const text = value.trim().toLowerCase().replace(/\.$/, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(text)) throw new Error("trusted domains must be explicit hostnames, without paths, wildcards, or email addresses");
  return text;
}
function mailboxDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const addresses = [...value.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@((?:[a-z0-9-]+\.)+[a-z]{2,63})/gi)];
  return addresses.length === 1 ? addresses[0][1].toLowerCase() : undefined;
}
const field = (text: string, name: string) => text.match(new RegExp(`^${name}:([^\\r\\n]+)`, "im"))?.[1]?.trim();
const clipped = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 1000);

function deriveScamState(review: unknown): ScamState {
  if (!review || typeof review !== "object" || Array.isArray(review)) return "unreviewed";
  const r = review as ScamReview;
  if (!Array.isArray(r.findings) || !Array.isArray(r.assessments) || !Array.isArray(r.reviews)) return "needs-review";
  if (r.findings.some((f) => f?.disposition === "confirmed-scam") || r.reviews.at(-1)?.decision === "confirmed-scam") return "confirmed-scam";
  if (r.findings.some((f) => !f || f.disposition === "open" || !["open", "false-positive", "confirmed-scam"].includes(f.disposition))) return "needs-review";
  return r.verification?.official_url && r.verification.trusted_domains?.length && r.reviews.length ? "cleared" : "unreviewed";
}
/** Clearance is for the recorded application route, not merely some employer's official website. */
function routeIssue(review: ScamReview | undefined, url: unknown): string | undefined {
  const verification = review?.verification;
  if (!verification || (url == null && !verification.application_url)) return undefined;
  try {
    if (typeof url !== "string") throw new Error("missing route");
    const route = new URL(url);
    const host = hostOf(url);
    if (!host || route.username || route.password || !trustedHost(host, verification.trusted_domains) || route.href !== verification.application_url) throw new Error("unverified route");
  } catch { return "The recorded application route is not bound to this verification; independently verify its employer/ATS domain and resolve the current route before progressing."; }
}
export function scamState(review: unknown, url?: unknown): ScamState {
  if (scamReviewErrors(review).length) return "needs-review";
  const state = deriveScamState(review);
  return state === "cleared" && routeIssue(review as ScamReview, url) ? "needs-review" : state;
}
export const scamBlocked = (record: { scam_review?: unknown; url?: unknown }) => scamState(record.scam_review, record.url) !== "cleared";
export function requireScamClear(record: { scam_review?: unknown; url?: unknown }, action: string): void {
  const state = scamState(record.scam_review, record.url);
  if (scamBlocked(record)) throw new Error(`${action} is held for scam review (${state}); use risk check, independently verify the employer/contact, then risk resolve. A clean text scan is not verification.`);
}

/** Structured indications to investigate. No rule emits confirmed-scam, and absent indications never clear identity. */
export function assessScam(input: ScamInput, previous?: ScamReview): ScamReview {
  if (previous && scamReviewErrors(previous).length) throw new Error("scam_review is malformed; repair it before assessing new evidence");
  const r: ScamReview = previous ? structuredClone(previous) : empty();
  const source = clipped(input.source);
  if (!source) throw new Error("a source reference is required for scam screening");
  // RFC-style header continuations are one logical field. Copied pass/fail claims remain untrusted;
  // failures are review indicators, while a pass never supplies identity verification.
  const headers = input.text.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, " ");
  const rawSender = input.sender ?? field(headers, "From");
  const rawReply = input.replyTo ?? field(headers, "Reply-To");
  const sender = mailboxDomain(rawSender), reply = mailboxDomain(rawReply);
  const urls = [...new Set([...(input.url ? [input.url] : []), ...[...input.text.matchAll(/https?:\/\/[^\s<>"'\]]+/gi)].map((m) => m[0].replace(/[.,);]+$/, ""))])];
  const domains = [...new Set(urls.map(hostOf).filter((h): h is string => !!h))];
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, sender: rawSender, replyTo: rawReply })).digest("hex");
  if (r.assessments.some((a) => a.fingerprint === fingerprint)) return r;
  const now = stamp();
  const findings: ScamFinding[] = [];
  const add = (code: string, reason: string) => {
    if (findings.some((f) => f.code === code && f.reason === reason)) return;
    findings.push({ id: `${fingerprint.slice(0, 12)}-${findings.length + 1}`, code, reason, source, observed_at: now, disposition: "open" });
  };
  const trusted = r.verification?.trusted_domains ?? [];
  if (!r.verification) add("identity-unverified", "The employer, official career route, and contact authority need independent verification.");
  const unverifiedRoute = routeIssue(r, input.url);
  if (unverifiedRoute) add("identity-unverified", unverifiedRoute);
  if (input.context === "email") {
    if (/^Authentication-Results:[^\r\n]*(?:spf|dkim|dmarc)\s*=\s*(?:fail|softfail|permerror)\b/im.test(headers)) add("authentication-failure", "Supplied email authentication results report a failure; confirm against the mail provider, since copied headers are themselves untrusted.");
    if (!sender) add("sender-unverified", "No single usable sender address was supplied; the message's claimed identity is not verified.");
    else if (trusted.length && !trustedHost(sender, trusted)) add("sender-domain", `Claimed sender domain ${sender} differs from this application's independently verified domains; a legitimate recruiter or ATS alias is possible.`);
    if (rawReply && !reply) add("reply-to-unverified", "Reply-To is ambiguous or unreadable; verify the reply destination independently.");
    else if (reply && sender && reply !== sender && !trustedHost(reply, trusted)) add("reply-to-domain", `Reply-To domain ${reply} differs from sender domain ${sender} and is not independently verified.`);
  }
  if (input.url) {
    const host = hostOf(input.url);
    if (!host) add("posting-url", "The application route is not a readable HTTP(S) URL; verify the official career route.");
    else if (trusted.length && !trustedHost(host, trusted)) add("posting-domain", `Posting domain ${host} is not among this application's verified employer/ATS domains.`);
  }
  for (const url of urls) {
    const host = hostOf(url);
    if (!host) continue;
    const u = new URL(url);
    if (u.username || u.password) add("deceptive-url", `A link uses URL user information before host ${host}; inspect the real destination without opening it.`);
    if (host.split(".").some((x) => x.startsWith("xn--")) && !trustedHost(host, trusted)) add("internationalized-domain", `Unverified internationalized domain ${host} needs visual and official-route verification; this alone is not fraud.`);
    if (input.context === "email" && trusted.length && !trustedHost(host, trusted) && /login|sign.?in|verify|auth|apply|onboard|assessment|download/i.test(u.pathname)) add("action-link-domain", `An action link points to unverified domain ${host}; verify it through the official employer route before using it.`);
  }
  // Evaluate each possible action in its clause. A negated action cannot suppress a later positive
  // request in the sentence. Shared "or" warnings inherit negation; ambiguous "and" requests
  // stay reviewable rather than guessing that a warning cancels the whole message.
  const clauses = input.text.split(/(?<=[.!?;])\s+|\r?\n|\b(?:but|however)\b/i).map((s) => s.trim()).filter(Boolean);
  for (const clause of clauses) {
    const actions = [...clause.matchAll(/\b(?:pay|send|transfer|deposit|cash|purchase|buy|provide|share|enter)\b/gi)];
    let previous: { end: number; negated: boolean; requested: boolean } | undefined;
    for (const action of actions) {
      const prefix = clause.slice(0, action.index);
      const between = clause.slice(previous?.end ?? 0, action.index);
      const coordinated = /\b(?:and|or)\s*$/i.test(between);
      const directNegation = /\b(?:never|do not|don't|will not|won't)\s+(?:(?:ask|require|request)\s+(?:you\s+)?(?:to\s+)?)?$|\byou (?:are not required|do not need) to\s*$/i.test(prefix);
      const negated: boolean = directNegation || !!(previous?.negated && /\bor\s*$/i.test(between));
      const requested: boolean = !prefix.trim() || /\b(?:please|kindly|you (?:must|need to|are required to|will need to)|we (?:require|ask) you to)\s*$/i.test(prefix) || !!(previous && coordinated && (previous.requested || previous.negated));
      previous = { end: action.index! + action[0].length, negated, requested };
      if (negated) continue;
      // A matching word may be an object noun ("a deposit"), not the next action. Do not
      // truncate request context at a lexical match; retain ambiguous context for review.
      const span = clause.slice(action.index);
      const paymentRequested = requested && /^(?:pay|send|transfer|deposit)\b.{0,65}\b(?:fee|money|funds|crypto(?:currency)?|bitcoin|gift cards?)\b|^(?:purchase|buy)\b.{0,50}\b(?:equipment|supplies|training|software)\b/i.test(span);
      if (paymentRequested) add("payment-request", "Text appears to request candidate payment, equipment purchases, or transfers; verify the exact request independently before proceeding.");
      if (/^(?:deposit|cash)\b.{0,45}\b(?:check|cheque)\b/i.test(span) && /equipment|supplies|vendor|send|return|forward|buy|purchase|reimburse/i.test(input.text)) add("check-equipment", "A check-deposit instruction appears alongside equipment/forwarding/payment language, a known fake-check pattern requiring review.");
      if (requested && /\b(?:password|passcode|one[- ]time code|verification code|security code|recovery (?:phrase|code)|seed phrase|api key)\b/i.test(span)) add("credential-request", "Text appears to request authentication secrets or a one-time code. Do not supply secrets or follow the message's instructions.");
      if (requested && /\b(?:social security|ssn|bank account|routing number|credit card|passport|driver'?s licen[cs]e)\b/i.test(span)) add("sensitive-data-request", "Text requests financial or identity information; verify the recipient and hiring stage independently. Legitimate payroll context does not verify this message.");
      if ((paymentRequested || (requested && /^(?:deposit|pay|transfer)\b/i.test(span))) && /\b(?:unlock|tasks?|commission|earnings|withdraw)\b/i.test(input.text)) add("task-payment", "A requested deposit/payment is tied to tasks, commissions, unlocking earnings, or withdrawals; investigate the documented task-scam pattern.");
    }
  }
  const assessment: ScamAssessment = { fingerprint, context: input.context, source, observed_at: now, ...(rawSender ? { claimed_sender: clipped(rawSender) } : {}), ...(sender ? { sender_domain: sender } : {}), ...(reply ? { reply_to_domain: reply } : {}), link_domains: domains, finding_ids: findings.map((f) => f.id) };
  r.assessments.push(assessment);
  r.findings.push(...findings);
  r.state = deriveScamState(r);
  return r;
}

export function resolveScam(previous: ScamReview | undefined, decision: "cleared" | "false-positive" | "confirmed-scam", reason: string, source: string, officialUrl?: string, aliases: string[] = [], applicationUrl?: string): ScamReview {
  if (previous && scamReviewErrors(previous).length) throw new Error("scam_review is malformed; repair it before resolving");
  if (!reason.trim() || !source.trim()) throw new Error("resolution needs a reason and independently obtained source reference");
  const r = previous ? structuredClone(previous) : empty();
  const unresolved = r.findings.filter((f) => f.disposition !== "false-positive");
  if (decision === "cleared" && (unresolved.some((f) => f.code !== "identity-unverified") || r.reviews.at(-1)?.decision === "confirmed-scam")) throw new Error("existing risk findings require an explicit false-positive or confirmed-scam resolution, with supporting evidence");
  const now = stamp();
  if (decision !== "confirmed-scam") {
    const host = officialUrl && hostOf(officialUrl);
    if (!host || !officialUrl?.startsWith("https://")) throw new Error("clearing review needs --official-url from an independently verified HTTPS employer career/contact page");
    const u = new URL(officialUrl);
    if (u.username || u.password) throw new Error("official verification URL cannot contain user information");
    const priorDomains = r.verification && hostOf(r.verification.official_url) === host ? r.verification.trusted_domains : [];
    const trusted = [...new Set([domain(host), ...priorDomains, ...aliases.map(domain)])];
    let route: string | undefined;
    if (applicationUrl !== undefined) {
      const routeHost = hostOf(applicationUrl);
      if (!routeHost || !trustedHost(routeHost, trusted)) throw new Error("the recorded application route must match an independently verified employer/ATS domain; corroborate it and include that domain with --trusted-domains");
      const u = new URL(applicationUrl);
      if (u.username || u.password) throw new Error("the recorded application route cannot contain URL user information");
      route = u.href;
    }
    r.verification = { official_url: officialUrl, trusted_domains: trusted, verified_at: now, reason: clipped(reason), ...(route ? { application_url: route } : {}) };
  }
  const findingIds = unresolved.map((f) => f.id);
  for (const f of unresolved) f.disposition = decision === "confirmed-scam" ? "confirmed-scam" : "false-positive";
  r.reviews.push({ decision, reason: clipped(reason), source: clipped(source), recorded_at: now, finding_ids: findingIds, ...(decision !== "confirmed-scam" ? { verification: structuredClone(r.verification!) } : {}) });
  r.state = deriveScamState(r);
  return r;
}

/** Malformed safety metadata fails closed; old records without it remain readable but require review before actions. */
export function scamReviewErrors(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value !== "object" || Array.isArray(value)) return ["scam_review must be a mapping"];
  const r = value as ScamReview;
  const errors: string[] = [];
  const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
  const time = (v: unknown) => typeof v === "string" && !!normalizeAt(v);
  if (!SCAM_STATES.includes(r.state)) errors.push("scam_review.state is unknown");
  for (const key of ["findings", "assessments", "reviews"] as const) if (!Array.isArray(r[key])) errors.push(`scam_review.${key} must be a list`);
  if (errors.length) return errors;
  for (const f of r.findings) if (!f || !text(f.id) || !text(f.code) || !text(f.reason) || !text(f.source) || !time(f.observed_at) || !["open", "false-positive", "confirmed-scam"].includes(f.disposition)) errors.push("scam_review contains a malformed finding");
  for (const a of r.assessments) if (!a || !text(a.fingerprint) || !["posting", "email"].includes(a.context) || !text(a.source) || !time(a.observed_at) || !strings(a.link_domains) || !strings(a.finding_ids) || [a.claimed_sender, a.sender_domain, a.reply_to_domain].some((v) => v !== undefined && !text(v))) errors.push("scam_review contains a malformed assessment");
  for (const review of r.reviews) if (!review || !["cleared", "false-positive", "confirmed-scam"].includes(review.decision) || !text(review.reason) || !text(review.source) || !time(review.recorded_at) || !strings(review.finding_ids)) errors.push("scam_review contains a malformed resolution");
  for (const v of [r.verification, ...r.reviews.map((review) => review?.verification)].filter((v) => v !== undefined)) {
    let official = false;
    try {
      const url = new URL(v.official_url);
      official = url.protocol === "https:" && !url.username && !url.password && Array.isArray(v.trusted_domains) && v.trusted_domains.includes(hostOf(v.official_url)!);
      if (v.application_url !== undefined) {
        const route = new URL(v.application_url);
        official = official && !!hostOf(v.application_url) && !route.username && !route.password && trustedHost(route.hostname.toLowerCase().replace(/\.$/, ""), v.trusted_domains);
      }
    } catch { official = false; /* Malformed hand-edited verification stays held. */ }
    if (!official || !text(v.reason) || !Array.isArray(v.trusted_domains) || !v.trusted_domains.length || !v.trusted_domains.every((d) => { try { return domain(d) === d; } catch { return false; } }) || !time(v.verified_at)) errors.push("scam_review verification is malformed");
  }
  if (!errors.length) {
    const ids = new Set(r.findings.map((f) => f.id));
    if (ids.size !== r.findings.length) errors.push("scam_review finding ids must be unique");
    if ([...r.assessments, ...r.reviews].some((entry) => entry.finding_ids.some((id) => !ids.has(id)))) errors.push("scam_review evidence references an unknown finding");
  }
  if (!errors.length && r.state !== deriveScamState(r)) errors.push("scam_review.state disagrees with its evidence and resolutions");
  return errors;
}

/** User-facing hold reasons stay readable even if hand-edited metadata is damaged. */
export function scamReasons(review: unknown, url?: unknown): string[] {
  const errors = scamReviewErrors(review);
  if (errors.length) return errors.map((e) => `${e}; repair evidence before progressing`);
  if (!review) return ["Independent employer/contact verification has not been recorded."];
  const route = routeIssue(review as ScamReview, url);
  return [...(route ? [route] : []), ...(review as ScamReview).findings.filter((f) => f.disposition !== "false-positive").map((f) => `${f.id}: ${f.reason} [${f.source}; ${f.observed_at}; ${f.disposition}]`)];
}
