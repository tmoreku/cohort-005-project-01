// PROTOTYPE (throwaway): browser push permission — wayfinder ticket #16.
// Minimal service worker: shows whatever FCM delivers. No Firebase SDK here;
// the FCM web payload is plain JSON with `notification` and/or `data`.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: "Cadence", body: event.data?.text() } };
  }
  const n = payload.notification ?? {};
  const d = payload.data ?? {};
  const title = n.title ?? d.title ?? "Cadence";
  // Every push must show a notification (no silent push).
  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body ?? d.body ?? "",
      icon: "/favicon.svg",
      data: { url: d.url ?? n.click_action ?? "/", raw: payload },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.focus().then(() => win.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
