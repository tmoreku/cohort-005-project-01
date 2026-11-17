import { useEffect } from "react";

type StoredLocale = {
  id: number;
  timezone: string | null;
  locale: string | null;
};

// On app load, tells the server the browser's timezone and locale when they
// differ from what's stored for the signed-in person. Reloading with the same
// values sends nothing. Locale comes from the browser, never the Dev Country.
export function useBrowserTimezoneAndLocale(user: StoredLocale | null) {
  const id = user?.id;
  const storedTimezone = user?.timezone ?? null;
  const storedLocale = user?.locale ?? null;

  useEffect(() => {
    if (id === undefined) return;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = navigator.language;
    if (!timezone || !locale) return;
    if (timezone === storedTimezone && locale === storedLocale) return;

    fetch("/api/user-locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone, locale }),
    }).catch(() => {
      // Best effort: the next load tries again.
    });
  }, [id, storedTimezone, storedLocale]);
}
