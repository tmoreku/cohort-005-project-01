import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { recordBrowserTimezoneAndLocale } from "./user-locale.server";

let db: ReturnType<typeof createTestDb>;
let userId: number;

function storedFor(id: number) {
  return db
    .select({ timezone: users.timezone, locale: users.locale })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

beforeEach(() => {
  db = createTestDb();
  userId = seedBaseData(db).user.id;
});

describe("recordBrowserTimezoneAndLocale", () => {
  it("stores the timezone and locale the browser detected", () => {
    const written = recordBrowserTimezoneAndLocale(db, userId, {
      timezone: "Africa/Johannesburg",
      locale: "en-ZA",
    });

    expect(written).toBe(true);
    expect(storedFor(userId)).toEqual({
      timezone: "Africa/Johannesburg",
      locale: "en-ZA",
    });
  });

  it("doesn't write again when nothing changed", () => {
    const detected = { timezone: "Africa/Johannesburg", locale: "en-ZA" };
    recordBrowserTimezoneAndLocale(db, userId, detected);

    expect(recordBrowserTimezoneAndLocale(db, userId, detected)).toBe(false);
  });

  it("writes when either value changes", () => {
    recordBrowserTimezoneAndLocale(db, userId, {
      timezone: "Africa/Johannesburg",
      locale: "en-ZA",
    });

    expect(
      recordBrowserTimezoneAndLocale(db, userId, {
        timezone: "Europe/London",
        locale: "en-ZA",
      })
    ).toBe(true);
    expect(storedFor(userId)).toEqual({
      timezone: "Europe/London",
      locale: "en-ZA",
    });
  });

  it("ignores an unknown timezone or locale, keeping the other", () => {
    recordBrowserTimezoneAndLocale(db, userId, {
      timezone: null,
      locale: "en-GB",
    });
    expect(storedFor(userId)).toEqual({ timezone: null, locale: "en-GB" });

    recordBrowserTimezoneAndLocale(db, userId, {
      timezone: "Europe/London",
      locale: null,
    });
    expect(storedFor(userId)).toEqual({
      timezone: "Europe/London",
      locale: "en-GB",
    });
  });
});
