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

/** URL without tracking parameters, fragment, or trailing slash, for duplicate detection. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|source|src|gh_src|lever-source|trk)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return (u.origin + u.pathname).replace(/\/$/, "") + (u.search ? u.search : "");
  } catch {
    return url.trim();
  }
}
