# Which hosted provider should power the Notification Feed and browser push?

Research for [issue #2](https://github.com/tmoreku/cohort-005-project-01/issues/2) (map: [#1](https://github.com/tmoreku/cohort-005-project-01/issues/1)).
Sources checked: **2026-11-13**. Pricing pages change often, so check them again before signing up.

## Recommendation

**Use SuprSend. Knock is the runner-up.**

- **SuprSend** is the only candidate that meets every hard constraint itself. Its free tier needs no card, and it has a prebuilt React Notification Feed (bell, unread badge, mark all read, real-time over WebSocket). It also has **first-party browser web push**: SuprSend holds the VAPID keys, you serve a small service worker, and the docs say it works on localhost. Email can be added later through the same workflows.
- **Knock** is the runner-up. Its React feed is the most polished and best documented, and its free tier is the same size (10k messages/mo, no card). However, **Knock has no first-party web push channel**. Browser push goes through Firebase Cloud Messaging, so you need a second account (Firebase), the Firebase JS SDK in the browser, and a Firebase service worker.
- **Novu** would come first on feed quality alone, and it bills per workflow run rather than per channel. Two things hold it back: the free tier allows **only 5 workflows**, and the Notification catalogue will probably need more. Web push also needs a third-party provider (FCM, Pushpad or OneSignal).

## Comparison

| | SuprSend | Knock | Novu | MagicBell | Courier | OneSignal |
|---|---|---|---|---|---|---|
| Free tier | 10k notifications/mo [1] | 10k messages/mo [2] | 10k workflow runs/mo [3] | 1,000 deliveries/mo [4] | 10k sends/mo [5] | 10k web-push subs, 10k emails/mo [6] |
| No credit card | Yes, stated [1] | Yes, stated [2] | Yes, stated [3] | Not stated | Not stated | Not stated |
| Billing unit | Per channel per user [1] | Per channel per user [2][7] | Per workflow run, any number of channels [8] | Per channel per delivery [4] | Per template send, any number of channels [5] | n/a |
| Other free limits | Feed shows SuprSend branding; 30-day logs; does not hard-stop on overage [1] | Knock branding; 30-day logs; no hard cap, asks for billing method next month [2] | **5 workflows**, 3 seats, 24h activity feed, branding [3] | 1 project [4] | — | No web inbox/feed product |
| React Notification Feed | `@suprsend/react` `Inbox`: bell, badge, popover, mark all read, custom bell/badge/header, headless hooks [9][10] | `@knocklabs/react`: `NotificationIconButton`, `NotificationFeedPopover`, `renderItem`, CSS vars, i18n [11] | `@novu/react` `<Inbox>`: bell, unread count, tabs, preferences, snooze, headless hooks [12] | `@magicbell/react`: `FloatingInbox`, `Inbox`, `UserPreferences`, `ToastContainer` [13] | Courier Inbox (not evaluated in depth) | None (in-app messages/carousels only) [6] |
| Real-time | WebSocket, handled by `Inbox` [10] | Real-time socket; optional auto-disconnect of inactive tabs [11] | Real-time feed and unread count [12] | Not documented on the page | WebSocket-based in-app channel [16] | n/a |
| Browser web push | **Native.** VAPID from dashboard; `/serviceworker.js`; `registerPush()` on a user click; "Most browsers allow push to work in localhost" [14] | **Via FCM only** ("does not have a first-party web push channel") [15] | Via FCM / Pushpad / OneSignal [17] | Native (`WebPushButton` + service worker importing MagicBell script) [13] | Via OneSignal / Pusher Beams providers [16] | Native (its core product) |
| Email (later) | Yes (bring an ESP) | Yes (bring an ESP) | Yes | Yes ("all integrations") | Yes | Yes |
| Node server SDK | `@suprsend/node-sdk` ≥1.10, `workflows.trigger(...)` [18] | `@knocklabs/node` | `@novu/api` | `magicbell-js` | Yes | REST |
| User identity | `distinctId` + **ES256 JWT** user token signed on server; enforced when "Enhanced Security Mode" is on (off in Sandbox) [19] | `sub` user ID + **RS256 JWT** signed on server; "Production environments should enable enhanced security mode" [20] | `subscriberId` + **HMAC-SHA256** `subscriberHash` [21] | User **JWT** passed as `token` [13] | — | — |

## Notes per criterion

### Free tier

- All three serious candidates (SuprSend, Knock, Novu) say "no credit card required", and none hard-stops sending at the limit. They contact you instead [1][2].
- With per-channel billing (SuprSend, Knock), a Notification sent to the feed *and* to push counts as 2. 10k/mo is still far more than a learning project will use.
- MagicBell's 1,000 deliveries/mo, counted per channel, is tight but workable for local dev. Its pricing page does not say whether a card is needed [4].

### Web push and localhost

- Browsers allow the Push API only on secure origins, and `http://localhost` counts as one. SuprSend states this directly: "WebPush notifications only work over HTTPS. Most browsers allow push to work in localhost also for development purposes." [14] So web push should work on the Cadence dev server without a tunnel. A ticket in the map already plans to confirm this.
- SuprSend: you put a `serviceworker.js` at the site root that loads the SuprSend SDK from jsDelivr and calls `initSuprSend(publicKey)`. You pass `vapidKey` to `SuprSendProvider` and call `registerPush()` from a button click, not on page load [14]. In React Router, put the file in `public/serviceworker.js`.
- Knock: you set up FCM in Knock, add the Firebase SDK and Firebase's service worker, get a browser token with your VAPID key, and store it as the user's FCM channel data in Knock [15]. This means more moving parts and two dashboards.
- iOS Safari supports web push only for sites added to the Home Screen. This applies to every provider.

### Identifying users (relevant to DevUI user switching)

- Every candidate uses the same pattern: the server holds a secret, signs a per-user token or hash in a loader, and passes it to the client provider. For Cadence, sign it in the root loader with the current session user's ID. When the DevUI switches users, the loader reruns and the token changes.
- SuprSend's React SDK takes a `refreshUserToken` callback for expiring JWTs [19]. Its Sandbox does not check tokens, which makes local dev simpler [19].

### Email later

- Every candidate supports email. Generally you connect your own email service (SendGrid, Resend, SES, etc.) as a vendor. No candidate was ruled out on email.

## Why not the others

- **OneSignal**: excellent web push, but it has no in-app Notification Feed/inbox for the web. The Feed is the main requirement [6].
- **Courier**: generous free tier, but its pricing page does not say whether a card is needed, and browser push goes through third-party providers (OneSignal/Pusher Beams) [5][16].
- **MagicBell**: technically a strong fit (native web push and a React inbox), but the free tier is 1,000 deliveries/mo, it has 1 project, and the card requirement is not stated [4].

## Sources

1. SuprSend pricing: https://www.suprsend.com/pricing
2. Knock pricing: https://knock.app/pricing
3. Novu pricing: https://novu.co/pricing
4. MagicBell pricing: https://www.magicbell.com/pricing
5. Courier pricing: https://www.courier.com/pricing
6. OneSignal pricing: https://onesignal.com/pricing
7. Knock plans and usage: https://docs.knock.app/manage-your-account/knock-plans
8. Novu billing: https://docs.novu.co/platform/account/billing
9. SuprSend React inbox overview: https://docs.suprsend.com/docs/inbox-react
10. SuprSend popover feed / customising: https://docs.suprsend.com/docs/react-in-app-feed, https://docs.suprsend.com/docs/react-customize-inbox
11. Knock React feed: https://docs.knock.app/in-app-ui/react/feed
12. Novu Inbox: https://docs.novu.co/platform/inbox/overview
13. MagicBell React: https://www.magicbell.com/docs/libraries/magicbell-react
14. SuprSend JS web push: https://docs.suprsend.com/docs/js-webpush (React: https://docs.suprsend.com/docs/react-webpush)
15. Knock web push via FCM: https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm, push providers: https://docs.knock.app/integrations/push/overview
16. Courier guides: https://www.courier.com/guides/react-notifications, https://www.courier.com/docs/platform/channels/push/pusher-beams/
17. Novu push providers: https://docs.novu.co/platform/integrations/push, https://docs.novu.co/platform/integrations/push/pushpad
18. SuprSend Node trigger: https://docs.suprsend.com/docs/node-trigger-workflow-from-api
19. SuprSend client authentication: https://docs.suprsend.com/docs/client-authentication
20. Knock security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
21. Novu prepare for production: https://docs.novu.co/platform/inbox/prepare-for-production
