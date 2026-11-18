// Cadence's service worker: browser push (spec #21, docs/adr/0013).
//
// Knock sends each push step through Firebase Cloud Messaging. This handles
// the push itself, without the Firebase SDK: FCM delivers plain JSON with
// `notification` (Knock's title and body) and `data` (the workflow's trigger
// data, flattened, every value a string). `data.url` is the Notification's
// one target, shared with the Feed row and the email button.
//
// Tests: app/service-worker.test.ts.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);

function readPayload(data) {
  if (!data) return {};
  try {
    const payload = data.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return { notification: { body: data.text() } };
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event.data);
  const notification = payload.notification || {};
  const data = payload.data || {};

  // Every push must show a notification: browsers revoke push from sites
  // that receive one silently.
  event.waitUntil(
    self.registration.showNotification(
      notification.title || data.title || "Cadence",
      {
        body: notification.body || data.body || "",
        icon: "/favicon.svg",
        tag: data.knock_message_id || undefined,
        data: { url: data.url || "/" },
      }
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find(
          (win) => new URL(win.url).origin === self.location.origin
        );
        // navigate() only works on a window this worker controls.
        if (open) {
          return open
            .focus()
            .then((win) => win.navigate(url))
            .catch(() => self.clients.openWindow(url));
        }
        return self.clients.openWindow(url);
      })
  );
});
