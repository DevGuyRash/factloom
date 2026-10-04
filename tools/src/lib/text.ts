/** Lowercase hyphenated slug, ASCII only. */
export function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-") || "unknown";
}

const COMPANY_SUFFIX = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|holdings|group)\b\.?/g;

/** Company name reduced for comparison: "Acme, Inc." and "ACME" match. */
export function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/[’']/g, "").replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * Whether two names are one employer: the same after normalizing, or one is a shorter form of the other by whole
 * leading words ("swca" and "swca environmental consultants"; "amazon" and "amazon.com services llc"), while "meta"
 * is not "metabolic labs".
 */
export function sameEmployer(a: string, b: string): boolean {
  const x = normalizeCompany(a), y = normalizeCompany(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length < y.length ? [x, y] : [y, x];
  return longer.startsWith(`${shorter} `);
}

export function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").split(" ").filter((t) => t.length > 1));
}

/** Jaccard similarity of word sets, 0..1. */
export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Query keys that only say where a click came from. */
const TRACKING_KEY = /^(utm_|ref|source|src|gh_src|lever-source|trk|trackingid$|tracking_id$|ebp$|gclid$|fbclid$|msclkid$|mc_|_hs|lipi$|midtoken$|midsig$|alternatechannel$|recommendedflavor$|originalsubdomain$)/i;

/**
 * A posting's link reduced to what identifies it, for duplicate detection: no tracking parameters, fragment, "www.",
 * trailing slash, or trailing apply page. Boards whose job id names the posting reduce to that id, so a link from a
 * search page, a share, or a tracked click matches the plain posting link.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (/(^|\.)linkedin\.com$/.test(host)) {
      const id = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d+)\b/)?.[1] ?? u.searchParams.get("currentJobId");
      if (id) return `https://linkedin.com/jobs/view/${id}`;
    }
    if (/(^|\.)indeed\.com$/.test(host) && u.searchParams.get("jk")) return `https://${host}/viewjob?jk=${u.searchParams.get("jk")}`;
    if (/(^|\.)ziprecruiter\.com$/.test(host) && u.searchParams.get("jid")) return `https://ziprecruiter.com/jobs?jid=${u.searchParams.get("jid")}`;
    for (const k of [...u.searchParams.keys()]) if (TRACKING_KEY.test(k)) u.searchParams.delete(k);
    u.hash = "";
    const path = u.pathname.replace(/\/(apply|application)\/?$/i, "").replace(/\/$/, "");
    return `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}
