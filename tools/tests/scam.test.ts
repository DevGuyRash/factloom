import assert from "node:assert/strict";
import test from "node:test";
import { assessScam, requireScamClear, resolveScam, scamBlocked, scamReviewErrors, trustedHost } from "../src/lib/scam.ts";

const verified = () => resolveScam(undefined, "cleared", "Verified the real employer and its career route independently", "Official independently found careers page", "https://employer.example/careers", ["ats.example"]);
const email = (text: string, source = "mail:1") => ({ text, context: "email" as const, source });

test("no indicators is not verification, and equipment/remote/crypto words or actual warnings are not scam proof", () => {
  const r = assessScam({ text: "Remote research role. We provide equipment and study cryptocurrency. Never send money or share passwords. We do not ask you to pay fees.", context: "posting", source: "posting:1" });
  assert.equal(r.state, "needs-review");
  assert.deepEqual(r.findings.map((f) => f.code), ["identity-unverified"]);
  assert.throws(() => requireScamClear({ scam_review: r }, "submit"), /held for scam review/);
  assert.equal(scamBlocked({}), true);
});

test("verified aliases and true subdomains work; deceptive suffixes and Reply-To discrepancies require review only", () => {
  assert.equal(trustedHost("jobs.employer.co.uk", ["employer.co.uk"]), true);
  assert.equal(trustedHost("employer.co.uk.attacker.example", ["employer.co.uk"]), false);
  assert.equal(trustedHost("notemployer.co.uk", ["employer.co.uk"]), false);
  const good = assessScam(email("From: Recruiter <person@ats.example>\nThank you for applying."), verified());
  assert.equal(good.state, "cleared");
  const suspicious = assessScam(email("From: Employer <person@employer.example.attacker.example>\nReply-To: person@other.example\nInterview invitation", "mail:2"), good);
  assert.equal(suspicious.state, "needs-review");
  assert.ok(suspicious.findings.some((f) => f.code === "sender-domain"));
  assert.ok(suspicious.findings.some((f) => f.code === "reply-to-domain"));
  assert.ok(suspicious.findings.every((f) => f.disposition === "open"));
  assert.equal(suspicious.assessments.at(-1)?.sender_domain, "employer.example.attacker.example");
});

test("payment/check/credential/task requests are uncertain evidence; negation elsewhere does not bypass them", () => {
  const text = "From: Recruiter <person@ats.example>\nNever share passwords, but please deposit this check and buy equipment from the vendor. Please send your password and verification code. Please deposit cryptocurrency to unlock tasks and earnings.";
  const r = assessScam(email(text), verified());
  for (const code of ["payment-request", "check-equipment", "credential-request", "task-payment"]) assert.ok(r.findings.some((f) => f.code === code), code);
  assert.equal(r.state, "needs-review");
  assert.doesNotMatch(JSON.stringify(r), /Do not worry|Please send/);
  for (const body of ["Please send a deposit fee.", "Please send a deposit of bitcoin to unlock tasks and earnings."]) {
    const deposit = assessScam(email(`From: Recruiter <jobs@employer.example>\n${body}`), verified());
    assert.ok(deposit.findings.some((f) => f.code === "payment-request"), "an action-like noun must not truncate the requested payment object");
    if (body.includes("tasks")) assert.ok(deposit.findings.some((f) => f.code === "task-payment"));
    assert.equal(deposit.state, "needs-review");
  }
  assert.equal(assessScam(email("From: Recruiter <jobs@employer.example>\nNever send a deposit fee."), verified()).state, "cleared", "a directly negated warning is not a positive payment demand");
});

test("incoming authentication failures and action links require review; headers and a clean scan cannot create verification", () => {
  const r = assessScam(email("From: Person <person@employer.example>\nAuthentication-Results: provider.example; dmarc=fail\nApply at https://other.example/apply/1"), verified());
  assert.ok(r.findings.some((f) => f.code === "authentication-failure"));
  assert.ok(r.findings.some((f) => f.code === "action-link-domain"));
  assert.equal(r.state, "needs-review");
  const unsigned = assessScam(email("From: Person <person@employer.example>\nAuthentication-Results: provider.example; dmarc=pass\nThank you for applying."));
  assert.notEqual(unsigned.state, "cleared");
});

test("resolutions preserve review history, require explicit false positives, and new evidence reopens only its application", () => {
  let r = assessScam(email("From: Person <person@recruiter.example>\nInterview invitation"), verified());
  assert.throws(() => resolveScam(r, "cleared", "No issue", "Official source", "https://employer.example/careers"), /false-positive/);
  r = resolveScam(r, "false-positive", "Official employer verified the agency recruiter", "Official contact confirmation", "https://employer.example/careers", ["recruiter.example"]);
  assert.equal(r.state, "cleared");
  assert.ok(r.verification?.trusted_domains.includes("ats.example"), "existing verified aliases survive a later resolution");
  const same = assessScam(email("From: Person <person@recruiter.example>\nInterview invitation"), r);
  assert.equal(same.assessments.length, r.assessments.length, "the same evidence is idempotent");
  r = assessScam(email("From: Person <person@recruiter.example>\nPlease send money for training.", "mail:2"), r);
  assert.equal(r.state, "needs-review");
  assert.equal(verified().state, "cleared", "no global employer allow/block mutation");
  r = resolveScam(r, "confirmed-scam", "The independent employer denied this named impersonation", "Official employer security notice");
  assert.equal(r.state, "confirmed-scam");
  r = resolveScam(r, "false-positive", "The employer corrected its earlier statement with independent evidence", "Official corrected notice", "https://employer.example/careers");
  assert.equal(r.state, "cleared");
  assert.ok(r.reviews.some((x) => x.decision === "confirmed-scam"));
  const originalVerification = structuredClone(r.reviews[0].verification);
  r = resolveScam(r, "cleared", "The verified employer moved to a new official domain", "Official independently corroborated move", "https://new-employer.example/careers");
  assert.deepEqual(r.reviews[0].verification, originalVerification, "past verified routes remain auditable after the current route changes");
  assert.equal(scamReviewErrors(r).length, 0);
});

test("malformed safety metadata fails closed, and invalid verification cannot clear a hold", () => {
  for (const value of [true, [], { ...verified(), verification: { ...verified().verification, official_url: "http://employer.example" } }, { ...verified(), reviews: [{ ...verified().reviews[0], source: 5 }] }, { state: "cleared", findings: {}, assessments: [], reviews: [] }, { state: "cleared", findings: [null], assessments: [], reviews: [] }, { ...verified(), findings: [{ id: "x", code: "x", reason: "x", source: "x", observed_at: 123, disposition: "open" }] }]) {
    assert.ok(scamReviewErrors(value).length);
    assert.equal(scamBlocked({ scam_review: value }), true);
    assert.throws(() => requireScamClear({ scam_review: value }, "submit"));
  }
  assert.throws(() => resolveScam(undefined, "cleared", "Reason", "Source", "https://employer.example@attacker.example"), /user information/);
  assert.throws(() => resolveScam(undefined, "cleared", "Reason", "Source", "https://employer.example", ["*.example"]), /hostnames/);
  assert.throws(() => resolveScam(undefined, "cleared", "", "Source", "https://employer.example"), /reason/);
});
