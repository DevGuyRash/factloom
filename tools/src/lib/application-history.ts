// The existing application record is the only store. History is additive: legacy prose is never
// parsed into guessed events, and existing fields remain available to older readers/templates.
import { flag, has, type Args } from "./args.ts";
import type { Record_ } from "./applications.ts";
import { stamp, today } from "./repo.ts";
import { APPLICATION_CONTACT_FIELDS, APPLICATION_LABEL, APPLICATION_LOCATION_FIELDS, type ApplicationDetails, type ApplicationEvent } from "./schema.ts";
import { normalizeAt } from "./when.ts";

export function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function eventDate(value: string, label = "--on"): string {
  if (calendarDate(value)) return value;
  const at = normalizeAt(value);
  if (at && calendarDate(at.text.slice(0, 10))) return at.text;
  throw new Error(`${label} takes a real YYYY-MM-DD date or a datetime with its UTC offset`);
}

export function appendEvent(data: Record_, event: Omit<ApplicationEvent, "recorded_at">): void {
  if (data.events != null && !Array.isArray(data.events)) throw new Error("events must be a list; repair the record before updating it");
  if (!APPLICATION_LABEL.test(event.kind)) throw new Error("event kind must be a lowercase hyphenated slug");
  eventDate(event.on);
  data.events = [...(data.events ?? []), { ...event, recorded_at: stamp() }];
}

/** Merge only explicitly supplied flags, including partial nested contacts/addresses. */
export function detailsFromArgs(a: Args, current: ApplicationDetails = {}): ApplicationDetails {
  const patch: ApplicationDetails = {};
  for (const [key, prefix, fields] of [
    ["address_of_record", "", APPLICATION_LOCATION_FIELDS],
    ["alternate_location", "alternate-", APPLICATION_LOCATION_FIELDS],
    ["contact", "contact-", APPLICATION_CONTACT_FIELDS],
  ] as const) {
    for (const field of fields) {
      const name = `${prefix}${field}`;
      if (!has(a, name)) continue;
      const value = flag(a, name);
      if (value === undefined || !value.trim()) throw new Error(`--${name} needs text; omit unknown values`);
      const previous = current[key];
      if (previous != null && (typeof previous !== "object" || Array.isArray(previous))) throw new Error(`${key} must be a mapping; repair the record before updating it`);
      patch[key] = { ...(patch[key] ?? previous ?? {}), [field]: value.trim() };
    }
  }
  if (has(a, "contact-method")) {
    const value = flag(a, "contact-method");
    if (!value?.trim()) throw new Error("--contact-method needs text");
    patch.contact_method = value.trim();
  }
  return patch;
}

export const DETAILS_USAGE = [...APPLICATION_LOCATION_FIELDS.map((f) => `[--${f} TEXT]`),
  "[--contact-method TEXT]", ...APPLICATION_CONTACT_FIELDS.map((f) => `[--contact-${f} TEXT]`),
  ...APPLICATION_LOCATION_FIELDS.map((f) => `[--alternate-${f} TEXT]`)].join(" ");

/** Validate optional structured fields without requiring old records to have them. */
export function applicationRecordErrors(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [key, fields] of [["address_of_record", APPLICATION_LOCATION_FIELDS], ["alternate_location", APPLICATION_LOCATION_FIELDS], ["contact", APPLICATION_CONTACT_FIELDS]] as const) {
    const value = data[key];
    if (value == null) continue;
    if (typeof value !== "object" || Array.isArray(value)) { errors.push(`${key} must be a mapping`); continue; }
    for (const f of fields) {
      const v = (value as Record<string, unknown>)[f];
      if (v != null && typeof v !== "string") errors.push(`${key}.${f} must be text (quote postal codes to keep leading zeros)`);
    }
  }
  if (data.custom_statuses != null && (!Array.isArray(data.custom_statuses) || data.custom_statuses.some((s) => typeof s !== "string" || !APPLICATION_LABEL.test(s)))) errors.push("custom_statuses must be a list of lowercase-hyphenated slugs");
  if (data.contact_method != null && typeof data.contact_method !== "string") errors.push("contact_method must be text");
  for (const f of ["date_contacted", "hired", "start_date", "started"]) {
    if (data[f] != null && (typeof data[f] !== "string" || !calendarDate(data[f]))) errors.push(`${f} must be a real YYYY-MM-DD date`);
  }
  if (data.events != null) {
    if (!Array.isArray(data.events)) errors.push("events must be a list");
    else for (const [i, value] of data.events.entries()) {
      const prefix = `events[${i}]`;
      if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${prefix} must be a mapping`); continue; }
      const e = value as Record<string, unknown>;
      if (typeof e.kind !== "string" || !APPLICATION_LABEL.test(e.kind)) errors.push(`${prefix}.kind must be a lowercase hyphenated slug`);
      try { eventDate(String(e.on ?? "")); } catch { errors.push(`${prefix}.on must be a real date or datetime with offset`); }
      if (typeof e.recorded_at !== "string" || !normalizeAt(e.recorded_at) || !calendarDate(e.recorded_at.slice(0, 10))) errors.push(`${prefix}.recorded_at must be a datetime with offset`);
      for (const f of ["at", "replaces"]) if (e[f] != null && (typeof e[f] !== "string" || !normalizeAt(e[f]) || !calendarDate(e[f].slice(0, 10)))) errors.push(`${prefix}.${f} must be a datetime with offset`);
      if (e.start_date != null && (typeof e.start_date !== "string" || !calendarDate(e.start_date))) errors.push(`${prefix}.start_date must be a real YYYY-MM-DD date`);
      if (e.status != null && (typeof e.status !== "string" || !APPLICATION_LABEL.test(e.status))) errors.push(`${prefix}.status must be a lowercase hyphenated slug`);
      for (const f of ["note", "round", "contact_method"]) if (e[f] != null && typeof e[f] !== "string") errors.push(`${prefix}.${f} must be text`);
    }
  }
  return errors;
}

/** User-supplied occurrence time, separate from the engine's current recorded/updated date. */
export const onFromArgs = (a: Args) => {
  if (has(a, "on") && !flag(a, "on")) throw new Error("--on needs a date");
  return eventDate(flag(a, "on") ?? today());
};
