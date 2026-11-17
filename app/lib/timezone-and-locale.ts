import { z } from "zod";

// ─── Timezone and locale ───
// A person's IANA timezone and BCP 47 locale, detected by the browser on app
// load and stored on `users`. They go into the person's Knock recipient
// profile, so emails can show times in their own zone. Locale never comes
// from the Dev Country.
//
// This is the one place they are validated. The client and the server both
// run detected values through the schema, so they compare the same
// canonical values and a reload with nothing changed sends no request.

function toTimezone(value: string): string | null {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

function toCanonicalLocale(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}

// A value that isn't valid becomes null rather than failing the whole body,
// so a bad timezone doesn't stop a good locale being stored, and vice versa.
export const timezoneAndLocaleSchema = z.object({
  timezone: z.string().max(100).transform(toTimezone),
  locale: z.string().max(100).transform(toCanonicalLocale),
});

// Null means unknown, the same as the nullable `users` columns.
export type TimezoneAndLocale = z.output<typeof timezoneAndLocaleSchema>;

// The detected values worth writing: valid, and different from what's
// stored. An unknown detected value is never a change.
export function timezoneAndLocaleChanges(
  stored: TimezoneAndLocale,
  detected: TimezoneAndLocale
): Partial<TimezoneAndLocale> {
  const changes: Partial<TimezoneAndLocale> = {};
  if (detected.timezone && detected.timezone !== stored.timezone) {
    changes.timezone = detected.timezone;
  }
  if (detected.locale && detected.locale !== stored.locale) {
    changes.locale = detected.locale;
  }
  return changes;
}
