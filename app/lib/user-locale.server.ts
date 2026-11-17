import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { users } from "~/db/schema";

// ─── Timezone and locale ───
// The browser reports its IANA timezone and BCP 47 locale on app load. They
// go into the person's Knock recipient profile, so emails can show times in
// their own zone. Locale never comes from the Dev Country.

type Db = BetterSQLite3Database<typeof schema>;

export type BrowserTimezoneAndLocale = {
  timezone: string;
  locale: string;
};

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function canonicalLocale(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}

// Writes only what is valid and different from what's stored. Returns whether
// anything was written.
export function recordBrowserTimezoneAndLocale(
  db: Db,
  userId: number,
  detected: BrowserTimezoneAndLocale
): boolean {
  const stored = db
    .select({ timezone: users.timezone, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!stored) return false;

  const changes: { timezone?: string; locale?: string } = {};
  if (isTimezone(detected.timezone) && detected.timezone !== stored.timezone) {
    changes.timezone = detected.timezone;
  }
  const locale = canonicalLocale(detected.locale);
  if (locale && locale !== stored.locale) {
    changes.locale = locale;
  }

  if (Object.keys(changes).length === 0) return false;

  db.update(users).set(changes).where(eq(users.id, userId)).run();
  return true;
}
