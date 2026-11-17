import { describe, expect, it } from "vitest";
import {
  timezoneAndLocaleChanges,
  timezoneAndLocaleSchema,
} from "./timezone-and-locale";

describe("timezoneAndLocaleSchema", () => {
  it("keeps a valid timezone and canonicalises the locale", () => {
    expect(
      timezoneAndLocaleSchema.parse({
        timezone: "Europe/London",
        locale: "EN-gb",
      })
    ).toEqual({ timezone: "Europe/London", locale: "en-GB" });
  });

  it("turns a timezone or locale that isn't valid into null, keeping the other", () => {
    expect(
      timezoneAndLocaleSchema.parse({
        timezone: "Not/AZone",
        locale: "not a locale!",
      })
    ).toEqual({ timezone: null, locale: null });
  });

  it("rejects a body without the two strings", () => {
    expect(timezoneAndLocaleSchema.safeParse({ timezone: 1 }).success).toBe(
      false
    );
  });
});

describe("timezoneAndLocaleChanges", () => {
  const stored = { timezone: "Europe/London", locale: "en-GB" };

  it("has no changes when the canonical values match what's stored", () => {
    expect(
      timezoneAndLocaleChanges(
        stored,
        timezoneAndLocaleSchema.parse({
          timezone: "Europe/London",
          locale: "en-gb",
        })
      )
    ).toEqual({});
  });

  it("lists only the values that differ", () => {
    expect(
      timezoneAndLocaleChanges(stored, {
        timezone: "Africa/Johannesburg",
        locale: "en-GB",
      })
    ).toEqual({ timezone: "Africa/Johannesburg" });
  });

  it("never treats a missing detected value as a change", () => {
    expect(
      timezoneAndLocaleChanges(stored, { timezone: null, locale: null })
    ).toEqual({});
  });
});
