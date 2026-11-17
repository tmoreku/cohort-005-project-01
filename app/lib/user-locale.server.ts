import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { users } from "~/db/schema";
import {
  timezoneAndLocaleChanges,
  type TimezoneAndLocale,
} from "~/lib/timezone-and-locale";

type Db = BetterSQLite3Database<typeof schema>;

// Stores the browser's detected timezone and locale (already parsed by
// `timezoneAndLocaleSchema`), writing only what changed. Returns whether
// anything was written.
export function recordBrowserTimezoneAndLocale(
  db: Db,
  userId: number,
  detected: TimezoneAndLocale
): boolean {
  const stored = db
    .select({ timezone: users.timezone, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!stored) return false;

  const changes = timezoneAndLocaleChanges(stored, detected);
  if (Object.keys(changes).length === 0) return false;

  db.update(users).set(changes).where(eq(users.id, userId)).run();
  return true;
}
