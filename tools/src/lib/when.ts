// Moments and deadlines kept in records: an interview is a datetime with its UTC offset, so it means the same thing
// on any computer and in any time zone; a due or close date is a calendar date, good until the end of that day.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?\s*(Z|[+-]\d{2}:?\d{2})$/i;

/** A datetime with its offset, as `2026-10-12T14:00-07:00`; null when it is not one (an offset is required, never guessed). */
export function normalizeAt(text: string): { text: string; ms: number } | null {
  const m = text.trim().match(DATE_TIME);
  if (!m) return null;
  const offset = m[4].toUpperCase() === "Z" ? "Z" : m[4].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const normalized = `${m[1]}T${m[2]}${m[3] ?? ""}${offset}`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : { text: normalized, ms };
}

/** A due or close time: a date (the end of that day on this computer) or a datetime with its offset. */
export function parseWhen(text: string): { text: string; ms: number } | null {
  const t = text.trim();
  if (DATE_ONLY.test(t)) {
    const ms = Date.parse(`${t}T23:59:59`);
    return Number.isNaN(ms) ? null : { text: t, ms };
  }
  return normalizeAt(t);
}

/** When a stored due, close, or interview value falls, in milliseconds; null when it is not a recognizable moment. */
export function whenMs(value: unknown): number | null {
  return typeof value === "string" ? (parseWhen(value)?.ms ?? null) : null;
}

/** "in 2 days", "in 3 hours", "2 days ago", "now": how far a moment is from `now`. */
export function relative(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 5 * 60000) return "now";
  const [n, unit] = abs >= 86400000 * 1.5 ? [Math.round(abs / 86400000), "day"] : abs >= 3600000 ? [Math.round(abs / 3600000), "hour"] : [Math.round(abs / 60000), "minute"];
  const span = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return diff > 0 ? `in ${span}` : `${span} ago`;
}
