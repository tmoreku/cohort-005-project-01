import { useEffect } from "react";
import {
  timezoneAndLocaleChanges,
  timezoneAndLocaleSchema,
  type TimezoneAndLocale,
} from "~/lib/timezone-and-locale";

// On app load, tells the server the browser's timezone and locale when they
// differ from what's stored for the signed-in person. Detected values go
// through the same schema the server uses, so they are compared in the
// canonical form the server stores and a reload with the same values sends
// nothing. Locale comes from the browser, never the Dev Country.
export function useBrowserTimezoneAndLocale(
  person: ({ id: number } & TimezoneAndLocale) | null
) {
  const id = person?.id;
  const storedTimezone = person?.timezone ?? null;
  const storedLocale = person?.locale ?? null;

  useEffect(() => {
    if (id === undefined) return;

    const browser = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    };
    const detected = timezoneAndLocaleSchema.safeParse(browser);
    if (!detected.success) return;

    const changes = timezoneAndLocaleChanges(
      { timezone: storedTimezone, locale: storedLocale },
      detected.data
    );
    if (Object.keys(changes).length === 0) return;

    fetch("/api/user-locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(browser),
    }).catch(() => {
      // Best effort: the next load tries again.
    });
  }, [id, storedTimezone, storedLocale]);
}
