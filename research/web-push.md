# Research: what web push can do for a browser-only Cadence

Ticket: #7, under map #5 "Notifications in Cadence". Researched 2026-11-16.

**Question.** What can web push do for Cadence, a browser-only app with no mobile app? This covers support across browsers and operating systems, service worker and HTTPS needs, VAPID, rules for asking permission, what happens when push is unsupported or denied, and limits on payload and delivery.

This note reports facts only. It does not recommend whether Cadence should ship push.

## TL;DR

- Web push is one set of standards: Service Workers, the Push API, the Notifications API, RFC 8030 for the transport, RFC 8291 for encryption and RFC 8292 for VAPID. Chrome, Edge, Firefox and Safari all support it, desktop and Android included. MDN marks it Baseline "widely available since March 2023".
- **iOS/iPadOS is the big caveat.** Push works only in a site the user has added to the Home Screen and opens as a web app, on iOS/iPadOS 16.4 or later. In an ordinary Safari tab, `Notification` and `PushManager` do not exist at all. Since Safari 26 (iOS 26), every site added to the Home Screen opens as a web app by default, and no manifest is needed. Before that, the manifest needed `display: standalone` or `fullscreen`.
- Requirements: HTTPS (a secure context), a registered service worker (except on Safari 18.4+ with Declarative Web Push), and a VAPID key pair. No Apple Developer account is needed.
- Safari and Firefox require a user gesture before asking for permission. Chrome does not, but it moves sites with low accept rates to a "quieter" prompt (Chrome 80+). Best practice everywhere is to ask in context, from a button, after an in-app pre-prompt.
- Every push must show a visible notification (`userVisibleOnly: true`). Safari revokes permission from sites that break this rule. Silent or background pushes are not available.
- Once a user denies permission, the site cannot ask again. Only the user can undo it, in browser or OS settings. Delivery is best-effort: the push service can drop or expire messages, and only a 4096-byte payload is guaranteed. Chrome now auto-revokes permission and rate-limits sites that send many notifications to users who rarely engage with them. Installed web apps are exempt from the auto-revoke.

## Findings

### 1. Platform support

Versions below come from MDN browser-compat-data v8.1.9 (2026-11-12) for `PushManager` and `ServiceWorkerRegistration.showNotification`.

| Platform | Push since | Notes |
|---|---|---|
| Chrome desktop / Android | 42 | `subscribe()` needs `applicationServerKey`. On Android, notifications can only be shown from a service worker. |
| Edge | 17 | Same as Chrome. |
| Firefox desktop / Android | 44 / 48 | `subscribe()` needs a user gesture from Firefox 72 (desktop) and Firefox Android 79. |
| Samsung Internet | 4.0 | Notifications only from a service worker. |
| Safari macOS | 16 (shipped in 16.1) | Needs macOS 13 Ventura or later. |
| Safari iOS/iPadOS | 16.4 | "Notifications are supported in web apps saved to the home screen." In a normal tab, "the `Notification` interface is undefined." |

- MDN describes the Push API as "Widely available … across browsers since March 2023". [MDN Push API]
- Safari 16.1 brought Web Push to macOS Ventura. The implementation needs Ventura or later because it relies on a system daemon, `webpushd`. [WebKit: Safari 16.1], [WebKit: Meet Web Push, 2022-06-07]
- Apple: "Add web push to Home Screen web apps in iOS 16.4 or later and Webpages in Safari 16 for macOS 13 or later." Also: "You don't need to join the Apple Developer Program to send web push notifications." [Apple Developer: Sending web push notifications]

### 2. iOS/iPadOS: installing to the Home Screen

- **iOS/iPadOS 16.4** (WebKit post, 2023-02-16): a site gets push only once it is added to the Home Screen *as a web app*. At the time, that needed a manifest whose `display` was `standalone` or `fullscreen`. Otherwise the site was saved as a bookmark that opened in the browser. The same release added the Badging API (`navigator.setAppBadge`), Focus mode integration and the manifest `id`. [WebKit: Web Push for Web Apps on iOS and iPadOS]
- **iOS 26 / Safari 26** (announced 2025-06-09): "By default, every website added to the Home Screen opens as a web app." "nothing is required beyond the basics of an HTML file and a URL." Users can still switch off "Open as Web App". [WebKit: News from WWDC25, Safari 26 beta]. Apple's user guide describes the "Open as Web App" toggle in Add to Home Screen. [Apple Support: Turn a website into an app]
- Users must add the app to the Home Screen themselves, from the Share sheet. Apple's sources describe no install prompt that a site can trigger. A forum thread from 2024 lists the lack of in-browser install prompts as a remaining gap. [Apple Developer Forums thread 748026] (a secondary source, included for context only)
- **EU**: the iOS 17.4 betas (early 2024) removed Home Screen web apps in the EU because of the DMA. Apple reversed this before release and kept them, on WebKit. [Apple Newsroom, 2024-01] and [Apple Developer: DMA and apps in the EU]. The current Apple DMA page no longer mentions it.
- Practical consequence for the UX: on iPhone and iPad, a Cadence user who has not installed the app has **no push API at all**. Feature detection must treat that as "unsupported" (perhaps with "add to Home Screen" guidance), not as "denied".

### 3. Service worker, HTTPS, Declarative Web Push

- Push needs "an active service worker", which subscribes via `PushManager.subscribe()`. The browser starts the service worker on demand to handle `push` events. [MDN Push API]
- `subscribe()`, `Notification.requestPermission()` and `showNotification()` are "available only in secure contexts (HTTPS)". Browsers also treat `localhost` as a secure context, so development works locally. [MDN PushManager.subscribe], [MDN requestPermission]
- Chrome and Firefox no longer let cross-origin iframes ask for notification permission. [MDN requestPermission]
- **Declarative Web Push** (Safari, iOS/iPadOS 18.4 and macOS 15.5, announced 2025-03-27):
  - Subscriptions can be made with `window.pushManager` and need no service worker.
  - The server sends JSON with `"web_push": 8030` and a `notification` object that must include a `title` and a `navigate` URL. The browser shows it with no JS.
  - A service worker can optionally change the message. If that fails, the declarative payload is shown as the fallback.
  - The same payload stays backwards compatible with browsers that handle it in a service worker.
  - Only Safari supports `window.pushManager` (18.4). [WebKit: Meet Declarative Web Push], [BCD]

### 4. Subscriptions, VAPID and encryption

- A `PushSubscription` contains an endpoint URL and the keys needed to encrypt payloads (`p256dh`, `auth`). The endpoint "needs to be kept secret". MDN also warns to protect subscription requests against CSRF/XSRF. A `pushsubscriptionchange` event fires when a subscription is invalidated or about to expire. [MDN Push API]
- `applicationServerKey` is the VAPID public key, an ECDSA P-256 key. When it is set, "all messages from your application server must use the VAPID authentication scheme". Chrome, Edge and Samsung Internet require it. [MDN PushManager.subscribe], [BCD]
- **VAPID** (RFC 8292):
  - The server signs a JWT with ES256 (P-256). The `aud` claim is the push service's origin, `exp` is at most 24 hours ahead, and `sub` is an optional `mailto:` or `https:` contact.
  - The JWT is sent as `Authorization: vapid t=<jwt>, k=<public key>`.
  - Missing auth gives 401. Invalid auth gives 403.
  - Changing keys requires **new subscriptions**: existing ones are bound to the old key. [RFC 8292 §2–4]
- Payloads must be encrypted with the subscription's keys (RFC 8291), so the push service cannot read them. [web.dev: Push notifications overview]
- Each browser uses its own push service, chosen by the vendor. Safari uses APNs, so the endpoints are on `*.push.apple.com`. Apple also says to use TLS with SNI and to keep no more than 100 unacknowledged HTTP/1.1 requests in flight. [web.dev overview], [Apple Developer: Sending web push notifications]

### 5. Asking for permission

- `Notification.requestPermission()` resolves to `granted`, `denied` or `default`. "default" means the user has not decided, and the app should treat it as denied. "the request should be made in response to user interaction". [MDN requestPermission]
- **Safari**: "Provide a method for the user to grant permission with a gesture, such as clicking or tapping a button. When the user completes the gesture, call the push subscription method immediately from the gesture's event handler code." [Apple Developer: Sending web push notifications]. On iOS, the request must be "in response to direct user interaction". [WebKit iOS 16.4 post]
- **Firefox** (from 72, announced 2019-11-04): prompts need user interaction (a click, tap or key press). "Prompts without interaction will only show a small icon in the url bar." The data behind this: in Firefox release, about 99% of notification prompts were not accepted and 48% were actively denied. [Mozilla Future Releases blog]
- **Chrome**:
  - Chrome does not require a gesture. Since **Chrome 80** it has a "quieter permission UI for notifications". Chrome automatically enrolls "sites with very low Accept rates" into it, and enrollment is decided separately for desktop and mobile. [Chrome for Developers: notification permission data in CrUX], [Chromium blog, 2020-01-07]
  - Chrome 84 extended the quiet UI to sites with abusive permission requests or notifications. [New in Chrome 84] (per search summary, not re-read in full)
  - Since 2025-10-10, Chrome on Android and desktop auto-revokes notification permission from sites with "very low user engagement and a high volume of notifications". It tells the user when it does this. "This feature does not revoke notifications for any installed web apps." [Google blog: automatic notification permission]
  - Since January 2026, sites that Chrome judges "disruptive" are rate-limited on the Push API: they may send no fewer than 1,000 messages per minute, and requests over the limit get an HTTP 429. The limit lasts 1, 7 or 14 days. Chrome judges this from messages and prompts sent relative to user engagement. [Chrome for Developers: Web push rate limits, 2026-01-06]
- **Best practice** [web.dev: Permissions best practices]:
  - "Never ask on page load or without user interaction." Allow rates rose from 12% to 30% when the prompt followed an interaction.
  - Use a pre-prompt (a "double permission" pattern), and trigger the browser prompt only after the user says yes to it.
  - Offer an alternative channel, such as email.
  - After a denial, check the state with `navigator.permissions.query()` and show browser-specific steps for re-enabling.

### 6. Unsupported or denied

- **Unsupported** (for example an iOS Safari tab, or iOS older than 16.4): `Notification`, `PushManager` or `serviceWorker` are missing. Sites should feature-detect, not browser-detect. Apple says sites that blocked Safari by browser detection must switch to feature detection. [BCD], [WebKit: Safari 16.1]
- **Denied**: the browser remembers the decision, so the site cannot ask again. Re-enabling is a manual step in site settings, or on iOS in Settings › Notifications. MDN: "if the user has denied notifications … there is no need to bother them anymore." [MDN requestPermission], [web.dev best practices]
- **Revoked later**:
  - Chrome may auto-revoke permission (see §5).
  - Safari revokes it if a push is received and no notification is shown.
  - Subscriptions can also expire. Sending to them then returns 404 or 410, and the server should delete them. [RFC 8030 §7.3], [Apple status-code table: 410 "The device token has expired."]

### 7. Payload and delivery limits

- **No silent push.** `userVisibleOnly: true` is required, and every push must show a notification.
  - Safari: "Violations of the userVisibleOnly promise will result in a push subscription being revoked." "The Web Push API is not an invitation for silent background runtime." [WebKit: Meet Web Push]
  - Firefox: pushes that create notifications are exempt from its push quota. Firefox has a quota on other pushes, and Chrome has none. [MDN Push API]
- **Size**: push services "MUST NOT return a 413" for bodies of 4096 bytes or less. That is the only guaranteed size. In practice, send a small payload such as a title, body and deep link, or an ID the service worker uses to fetch the details. [RFC 8030 §7.2]
- **Delivery semantics** (RFC 8030):
  - A 201 means the push service accepted the message, "This does not indicate that the message was delivered".
  - `TTL` (seconds) sets how long the service keeps a message for an offline device, and the service may shorten it. With TTL 0, a message is delivered only if the device is reachable right now.
  - `Urgency` is very-low, low, normal or high. It affects battery-driven delivery.
  - `Topic` (≤32 chars) replaces an undelivered message with the same topic.
  - Delivery receipts are opt-in.
  - There is no delivery guarantee. [RFC 8030 §5]
- **Rendering varies** (BCD v8.1.9):
  - Notification `actions` (buttons): Chrome 53+, Edge 18+, Firefox 152+, **not Safari**.
  - `image`: Chromium only.
  - `requireInteraction`: Chromium, and Firefox only on Windows.
  - Plan for title, body, icon and click-to-open as the common denominator. The `notificationclick` handler (or `navigate` in Declarative Web Push) opens the deep link. [MDN showNotification], [BCD]
- **Badging**: `navigator.setAppBadge()` works in installed iOS web apps, including while handling a push. [WebKit iOS 16.4 post]

## Open questions / not verified

- Whether a desktop browser must be running (for example Chrome on Windows with background apps off) to receive pushes. The primary sources found did not state this clearly.
- The exact accept-rate threshold for Chrome's quiet UI. Chrome does not publish it.
- Whether a given hosted orchestrator supports VAPID web push, and whether it supports the Declarative Web Push payload format. That belongs to the orchestrator research tickets.

## Sources

- MDN, Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN, PushManager.subscribe(): https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- MDN, Notification.requestPermission(): https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static
- MDN, ServiceWorkerRegistration.showNotification(): https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
- MDN browser-compat-data v8.1.9 (2026-11-12), `@mdn/browser-compat-data` `data.json`: https://github.com/mdn/browser-compat-data
- RFC 8030, Generic Event Delivery Using HTTP Push: https://www.rfc-editor.org/rfc/rfc8030
- RFC 8292, VAPID: https://www.rfc-editor.org/rfc/rfc8292
- RFC 8291, Message Encryption for Web Push: https://www.rfc-editor.org/rfc/rfc8291
- WebKit, Meet Web Push (2022-06-07): https://webkit.org/blog/12945/meet-web-push/
- WebKit, WebKit Features in Safari 16.1: https://webkit.org/blog/13399/webkit-features-in-safari-16-1/
- WebKit, Web Push for Web Apps on iOS and iPadOS (2023-02-16): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit, Meet Declarative Web Push (2025-03-27): https://webkit.org/blog/16535/meet-declarative-web-push/
- WebKit, News from WWDC25: Safari 26 beta (2025-06-09): https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- Apple Developer, Sending web push notifications in web apps and browsers: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Apple Support, Turn a website into an app in Safari on iPhone: https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- Apple Newsroom, changes to iOS, Safari and the App Store in the EU (2024-01): https://www.apple.com/newsroom/2024/01/apple-announces-changes-to-ios-safari-and-the-app-store-in-the-european-union/
- Mozilla, Restricting notification permission prompts in Firefox (2019-11-04): https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/
- Chromium blog, Introducing quieter permission UI for notifications (2020-01-07): https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html
- Chrome for Developers, Notification permission data in CrUX: https://developer.chrome.com/blog/notification-permission-data-in-crux
- Chrome for Developers, Web push rate limits (2026-01-06): https://developer.chrome.com/blog/web-push-rate-limits
- Google blog, Automatic notification permission revocation (2025-10-10): https://blog.google/chromium/automatic-notification-permission/
- web.dev, Permissions best practices: https://web.dev/articles/permissions-best-practices
- web.dev, Push notifications overview: https://web.dev/articles/push-notifications-overview
