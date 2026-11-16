# Hosted notification orchestrators for Cadence

**Question:** Which hosted notification orchestrators fit Cadence? Cadence is a React Router 8 app (framework mode, Node server, SQLite/Drizzle) that runs only in the browser. It needs an in-app Notification Feed, email, and web push, all through **one** hosted orchestrator (no self-hosting). It must be production grade and have a free tier usable in development.

**Date researched:** 2026-11-16
**Providers compared:** Knock, Novu (Cloud), Courier, SuprSend, MagicBell
**Method:** Official docs, official pricing pages, and the npm registry only. npm versions and peer dependencies were read with `npm view` on 2026-11-16. Where a primary source did not answer a question, this document says so.

---

## Key caveats up front

- **Web push is the deciding gap.** Only **SuprSend** and **MagicBell** document a first-party browser Web Push (VAPID + service worker) channel. **Knock**, **Novu** and **Courier** route browser push through a third party, either Firebase Cloud Messaging (FCM web) or a separate push vendor (OneSignal, Pushpad, Pusher Beams). That means a second account and a second SDK in the browser.
- **Feature gates on free plans differ a lot.** SuprSend's Free plan excludes user preferences and digests. MagicBell's free "Builder" plan has 1,000 deliveries/month and 1 project. Novu Free is capped at 5 workflows with 24h activity retention. Courier counts test-environment sends against the 10k quota.
- "Real-time" is WebSocket for every provider where it is documented. None documents SSE or polling as the primary transport.

---

## 1. Knock

### In-app feed (React)
- Package `@knocklabs/react` (v0.15.1 on npm, peer deps `react ^17 || ^18 || ^19`, optional `next ^13–^16` and `@tanstack/react-router`) ([npm](https://www.npmjs.com/package/@knocklabs/react)). It replaces `@knocklabs/react-notification-feed` ([docs](https://docs.knock.app/in-app-ui/react/overview)).
- **Prebuilt** `NotificationFeedPopover`, `NotificationFeed` and `NotificationIconButton`, plus a "complete set of React hooks" for headless UI ([docs](https://docs.knock.app/in-app-ui/react/overview)).
- **Real-time:** a socket connection that the feed client opens with `feedClient.listenForUpdates()` ("Connect to the real-time socket"). Options cover closing sockets on inactive tabs and reconnecting on focus, plus experimental BroadcastChannel tab sync ([client README](https://github.com/knocklabs/javascript/tree/main/packages/client); [feed docs](https://docs.knock.app/in-app-ui/react/feed)). The underlying protocol is not named in these pages.
- **States:** `seen`, `read`, `interacted`, `archived` and `link_clicked` ([message statuses](https://docs.knock.app/send-notifications/message-statuses)). By default the popover marks items as seen on open ([feed docs](https://docs.knock.app/in-app-ui/react/feed)).
- **Styling:** CSS variables prefixed `--rnf-`, overridable or fully replaceable `rnf-` classes, and `colorMode="dark"` ([feed docs](https://docs.knock.app/in-app-ui/react/feed)).
- **SSR / React 19:** React 19 is allowed by npm peer deps. The docs pages read do not discuss SSR.

### Web push
- **No first-party web push channel.** Knock's tutorial says Knock "does not have a first-party web push channel". It uses **FCM** instead: the Firebase JS SDK, a service worker, and a VAPID key to get an FCM token, which is stored as FCM channel data on the Knock user ([tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)).
- Push providers: APNs, FCM, Expo, Amazon SNS, OneSignal ([push overview](https://docs.knock.app/integrations/push/overview)).

### Email
- Supported providers: Amazon SES, Cloudflare Email, MailerSend, Mailgun, Mailjet, Mailtrap, Mandrill, Postmark, Resend, SendGrid, SMTP, SparkPost. The built-in **"Knock" sender is testing only** ([email overview](https://docs.knock.app/integrations/email/overview)).

### Preferences
- The preference set has keys `workflows`, `categories`, `channel_types` and `channels`, and they can be combined (for example, category × channel type). "Knock only sends a notification if all preference combinations … evaluate to `true`" ([preferences](https://docs.knock.app/preferences/overview)).
- A **hosted preference page** is reachable through a signed URL (default preference set only) ([preferences](https://docs.knock.app/preferences/overview)). React gets a `usePreferences` hook and a guide for building your own preference center. No prebuilt drop-in preference component was found ([React preferences guide](https://docs.knock.app/in-app-ui/react/preferences); [custom preference center](https://docs.knock.app/preferences/custom-preference-center)).

### Free tier (pricing page checked 2026-11-16)
- **Free $0:** "up to 10,000" messages/month, with bounced and failed messages excluded. **Unlimited environments**, unlimited stored profiles, unlimited workflows and channels, 30-day log retention ([pricing](https://knock.app/pricing)).
- Not on Free: branding removal, email client previews, translations (i18n), custom roles, audit logs, SAML/SCIM, per-tenant branding and preferences, HIPAA ([pricing](https://knock.app/pricing)).
- Next tier: Starter at $250/month for 50k messages ([pricing](https://knock.app/pricing)).

### Node SDK
- `@knocklabs/node` v1.41.1 (npm, modified 2026-11-10) ([npm](https://www.npmjs.com/package/@knocklabs/node)).

### Feed authentication
- The public API key plus a user ID is enough by default. **Enhanced security mode** requires a **signed JWT user token** (RS256 with your private signing key, `sub` = user id, `iat`/`exp` recommended). Knock says "Production environments should enable enhanced security mode" ([security](https://docs.knock.app/in-app-ui/security-and-authentication)).

### Notable
- Separate environments are standard and free ([pricing](https://knock.app/pricing)).
- Data residency was not verified from a primary source.

---

## 2. Novu (Cloud)

### In-app feed (React)
- Package `@novu/react` v3.19.2 (peer deps `react ^18 || ^19`). `@novu/js` is the framework-agnostic client ([npm](https://www.npmjs.com/package/@novu/react)). The docs say React 19 is supported and "React 17 and earlier versions are not supported" ([inbox overview](https://docs.novu.co/platform/inbox/overview)).
- **Prebuilt** `<Inbox />` ("prebuilt, ready-to-use, and fully customizable") or **headless** hooks/`@novu/js` ([inbox overview](https://docs.novu.co/platform/inbox/overview)).
- **Real-time:** WebSocket. `useNotifications` has a `realtime` flag that, when false, turns off the WebSocket subscription. EU customers set `socketUrl` ([useNotifications](https://docs.novu.co/platform/sdks/react/hooks/use-notifications); [prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)).
- **States:** read/unread, seen, archived, snoozed. Actions include `seen`, `archive`, `snooze`/`unsnooze`, `seenAll`, `archiveAll` and `archiveAllRead` ([useNotifications](https://docs.novu.co/platform/sdks/react/hooks/use-notifications)).
- **Styling:** the `appearance` prop takes `baseTheme` (dark theme shipped), `variables`, and `elements`, which accept style objects, Tailwind classes or CSS Modules, including callback functions. It also supports custom `icons` and disabling animations ([styling](https://docs.novu.co/platform/inbox/configuration/styling)).
- **SSR:** not covered on the pages read.
- The preference UI is **built into the Inbox** ([preferences](https://docs.novu.co/platform/concepts/preferences)).

### Web push
- **No native VAPID web push channel documented.** Push providers: FCM, Expo, APNs, OneSignal, Push Webhook, Pusher Beams, Pushpad ([push](https://docs.novu.co/platform/integrations/push)).
- **Push Webhook** only POSTs to "a webhook URL that you control", and "Your endpoint delivers the push" ([push webhook](https://docs.novu.co/platform/integrations/push/push-webhook)). Using it for web push means Cadence sends the push itself.
- **Pushpad** delivers to "all major browsers" but needs "an active Pushpad account" and the Pushpad SDK on the site ([pushpad](https://docs.novu.co/platform/integrations/push/pushpad)).

### Email
- 19 providers, including SendGrid, Amazon SES, Resend, Postmark, Brevo, Mailgun, Mailjet, SparkPost, Mandrill, MailerSend, Mailtrap, Plunk and Custom SMTP ([email](https://docs.novu.co/platform/integrations/email)).
- The **demo email integration** is capped at 300/month and "can only send emails to the address associated with your logged-in Novu account", so it is for development only ([demo integrations](https://docs.novu.co/platform/integrations/demo-integration)).

### Preferences
- Workflow channel defaults, subscriber **global** channel preferences, subscriber **per-workflow × channel** preferences, and **critical** workflows that cannot be opted out of ([preferences](https://docs.novu.co/platform/concepts/preferences)).
- The prebuilt UI is the Inbox Preferences view. No standalone hosted preference page was found on the pages read.

### Free tier (pricing page checked 2026-11-16)
- **Free $0:** 10,000 workflow runs/month, **up to 5 workflows**, **2 environments (Dev + Prod)**, unlimited subscribers, 24-hour activity feed retention, up to 3 team members. All channels, with US and EU data residency ([pricing](https://novu.co/pricing)).
- Not on Free: branding removal and the advanced email editor. The digest and delay window limits in the table were hard to parse, so verify them on the page ([pricing](https://novu.co/pricing)).
- Pro from $30/month (30k runs, 20 workflows). Team from $250/month ([pricing](https://novu.co/pricing)).

### Node SDK
- `@novu/api` v3.19.1 ([npm](https://www.npmjs.com/package/@novu/api)). `@novu/node` is **deprecated**: "March 20, 2025 marks the end of support for @novu/node" ([npm](https://www.npmjs.com/package/@novu/node)). `@novu/framework` v2.14.0 is for code-first workflows ([npm](https://www.npmjs.com/package/@novu/framework)).

### Feed authentication
- **HMAC subscriber hash:** `subscriberHash = HMAC-SHA256(secretKey, subscriberId)` in hex, turned on per environment with the "Security HMAC encryption" toggle. Without it, "a malicious actor could potentially guess another subscriber's `subscriberId`" ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)).

### Notable
- `@novu/notification-center` is deprecated in favour of `@novu/react`/`@novu/js` (since April 3, 2025) ([npm](https://www.npmjs.com/package/@novu/notification-center)).
- EU region uses separate `apiUrl`/`socketUrl` ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)).
- Novu is also open source and self-hostable, but that is out of scope here. Licensing details were not re-verified for this document.

---

## 3. Courier

### In-app feed (React)
- Package `@trycourier/courier-react` v9.3.5 (peer deps `react >=18`). It wraps Courier's web-component packages `@trycourier/courier-ui-inbox`, `-toast` and `-preferences` ([npm](https://www.npmjs.com/package/@trycourier/courier-react)). The old `@trycourier/react-inbox`/`react-provider` packages are deprecated ([npm](https://www.npmjs.com/package/@trycourier/react-inbox); [v8 migration](https://www.courier.com/docs/sdk-libraries/courier-react-v8-migration-guide)).
- **Prebuilt** `<CourierInbox />` and toasts. `useCourier()` exposes `shared`, `auth`, `inbox`, `toast` and `preferences` for custom UIs ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).
- **Real-time:** WebSocket, opened by `inbox.listenForUpdates()`. Without it the inbox "loads once and doesn't update" ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).
- **States:** `read`, `opened` and `archived` timestamps, tabs filtered by read/unread/archived ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)). State changes sync across devices, and opening the related email can mark the inbox message read ([inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview)).
- **Styling:** `CourierInboxTheme` / `CourierToastTheme` / `CourierPreferencesTheme`, or custom views ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).
- **SSR:** Inbox and Toast "support Next.js but render client-side only" ('use client'). React 19 is not mentioned in the docs, though npm peer deps (`>=18`) allow it ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).

### Web push
- **No native VAPID web push channel documented.** Push providers: APNs, FCM, Expo, OneSignal, Airship, Amazon SNS, Pusher Beams, Pusher, MagicBell, Pushbullet, Beamer, NowPush ([push overview](https://www.courier.com/docs/external-integrations/push/intro-to-push)). The FCM page targets `firebaseToken` ([FCM](https://www.courier.com/docs/external-integrations/push/firebase-fcm)). An end-to-end FCM **web** setup for Courier was not found in the docs.

### Email
- "Courier isn't an email provider. It sends through the providers you connect." The 13 providers are Amazon SES, SendGrid, Postmark, Mailgun, Resend, SMTP, Mandrill, SparkPost, Mailjet, MailerSend, Amply, Gmail and OneSignal. Gmail "suits testing" ([email](https://courier.com/docs/external-integrations/email/intro-to-email)). **No built-in sender.**

### Preferences
- Subscription topics, each defaulting to opted in, opted out, or **required**, plus per-topic channel selection and digest schedules. There is a prebuilt `<CourierPreferences>` React component, a **hosted preference page**, and a preferences API ([preferences](https://www.courier.com/docs/platform/preferences/); [hosted page](https://www.courier.com/docs/guides/build-a-preference-center#hosted-page); [embed](https://courier.com/docs/platform/preferences/use-guides/embed-courier-preferences); [API](https://www.courier.com/docs/recipients/preferences/api)).

### Free tier (pricing page and billing docs checked 2026-11-16)
- **Developer $0:** "up to 10k / mo." sends, where one template to one recipient is one send across all channels ([pricing](https://www.courier.com/pricing)).
- "Sends made with a Test key count the same as Production sends." Preference-blocked messages also count. Going past 10k "takes the Business plan" ([billing](https://www.courier.com/docs/workspaces/billing)).
- Not on Developer: AI credits, Device Preview, **EU datacenter** ([billing](https://www.courier.com/docs/workspaces/billing)).
- Business is $0.005/send from the first send. Custom environments are Enterprise only ([pricing](https://www.courier.com/pricing)).

### Node SDK
- `@trycourier/courier` v10.0.0 (npm, modified 2026-10-29) ([npm](https://www.npmjs.com/package/@trycourier/courier); [docs](https://www.courier.com/docs/sdk-libraries/node)).

### Feed authentication
- A **Courier-issued JWT**. Your backend calls `POST https://api.courier.com/auth/issue-token` with scopes `user_id:<id> inbox:read:messages inbox:write:events`, plus `read:preferences write:preferences` for preferences. The client calls `signIn({ userId, jwt })`. EU workspaces use `api.eu.courier.com` ([auth](https://courier.com/docs/platform/inbox/authentication); [React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).

### Notable
- The React inbox is a wrapper over web components and renders client-side only ([npm deps](https://www.npmjs.com/package/@trycourier/courier-react); [React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).
- Major package moves happened in v8 and the current line is v9 ([inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview)).

---

## 4. SuprSend

### In-app feed (React)
- Package `@suprsend/react` v1.5.0 (peer dep `react >= 16.8.0`, built on Emotion CSS-in-JS) and `@suprsend/react-core` for hooks ([npm](https://www.npmjs.com/package/@suprsend/react); [React SDK](https://docs.suprsend.com/docs/react-sdk)). `@suprsend/react-inbox` has reached end of support ([inbox overview](https://docs.suprsend.com/docs/inbox-react)).
- **Prebuilt** `Inbox` (bell + popover), `NotificationFeed` (full page) and `Preferences`, plus **headless** hooks ([React SDK](https://docs.suprsend.com/docs/react-sdk); [headless](https://docs.suprsend.com/docs/react-headless)).
- **Real-time:** WebSocket, handled by the Inbox. The headless JS SDK calls `initializeSocketConnection()` ([customising feed](https://docs.suprsend.com/docs/react-customize-inbox); [JS feed](https://docs.suprsend.com/docs/js-inapp-feed)).
- **States:** read/unread, seen (auto-seen can be turned off), archived (`markAsArchived`), and multiple tabs ("stores") with filters ([customising feed](https://docs.suprsend.com/docs/react-customize-inbox); [changelog](https://docs.suprsend.com/changelog/overview)).
- **Styling:** `theme` object, `themeType` light/dark, custom card and header components ([customising feed](https://docs.suprsend.com/docs/react-customize-inbox)).
- **SSR / React 19:** not stated on the pages read.

### Web push
- **Native browser Web Push with VAPID.** You pass `vapidKey` from Dashboard → Vendors → WebPush, serve `/serviceworker.js` (which imports SuprSend's service-worker script), and call `registerPush()` from a user gesture ([React webpush](https://docs.suprsend.com/docs/react-webpush); [JS webpush](https://docs.suprsend.com/docs/js-webpush)).
- In Sandbox, "SuprSend generates the VAPID key pair for you". Web push "needs HTTPS", with localhost exempt ([web push quick start](https://docs.suprsend.com/docs/web-push-quick-start)).
- No FCM is mentioned for web push, but the docs read do not state the delivery path explicitly.

### Email
- Vendors include SendGrid, Amazon SES, Mailgun, Resend, Postmark and Mailjet ([vendor integration](https://docs.suprsend.com/docs/email-vendor-integration)).
- **Sandbox workspace has SuprSend's own vendor accounts pre-integrated**, but sends can only go to verified channels (up to 5 per type) ([vendors](https://docs.suprsend.com/docs/vendors)).

### Preferences
- Global `channel_preferences`, per-category preferences, and per-category `opt_out_channels`, with On/Off/"Can't Unsubscribe" settings. There is a hosted preference page (`{{$hosted_preference_url}}`) and embeddable React/JS/Angular preference components ([user preferences](https://docs.suprsend.com/docs/user-preferences)).
- "The inbox channel preference is behind a feature flag" (contact support) ([user preferences](https://docs.suprsend.com/docs/user-preferences)).

### Free tier (pricing page checked 2026-11-16)
- **Free:** 10,000 notifications/month, unlimited channels, in-app feed **with SuprSend branding**. **Excludes batching/digest and user preferences**. Premium features run as a 30-day trial ([pricing](https://www.suprsend.com/pricing)).
- Preferences and digest start at **Business, $250/month**. Essentials ($100/month) removes branding only ([pricing](https://www.suprsend.com/pricing)). The comparison-table cells were inferred from page text, so confirm this on the live page.
- Default workspaces are **Sandbox, Staging and Production**, isolated with per-workspace keys ([workspaces guide](https://docs.suprsend.com/docs/guides/modelling-customers-workspace-vs-tenant)).

### Node SDK
- `@suprsend/node-sdk` v1.15.1 (npm, modified 2026-05-19) ([npm](https://www.npmjs.com/package/@suprsend/node-sdk)).

### Feed authentication
- A **signed JWT user token (ES256)**, minted server-side with claims `entity_type: "subscriber"`, `entity_id`, `iat` and `exp`, with a `refreshUserToken` callback. Verification only happens with **Enhanced Security Mode**, which is off in Sandbox. Older versions used HMAC ([client auth](https://docs.suprsend.com/docs/client-authentication); [inbox overview](https://docs.suprsend.com/docs/inbox-react)).

### Notable
- Self-hosted/BYOC options exist (out of scope) ([CLI profiles](https://docs.suprsend.com/docs/self-hosted/cli-profiles)).
- "Custom Data Center Region" is not on Free, Essentials or Business per the pricing table ([pricing](https://www.suprsend.com/pricing)).

---

## 5. MagicBell

### In-app feed (React)
- Package `@magicbell/react` v1.14.0 (no peer deps declared; depends on `reconnecting-websocket`). There are also older `@magicbell/magicbell-react` v11.5.1 and `@magicbell/react-headless` v5.5.1 ([npm](https://www.npmjs.com/package/@magicbell/react)).
- **Prebuilt** components: `ContextProvider`, `Inbox`, `FloatingInbox`, `InlineNotification`, `ToastContainer`, `UserPreferences`, `WebPushButton`, Slack buttons ([React docs](https://www.magicbell.com/docs/libraries/magicbell-react)). A headless hooks package exists on npm (`@magicbell/react-headless`), but it is not documented on the current React page.
- **Real-time:** "real-time notification delivery through WebSocket connections" ([magicbell-js](https://www.magicbell.com/docs/libraries/magicbell-js)).
- **States:** read/unread and archive/unarchive (`markNotificationRead`/`Unread`, `archiveNotification`, `markAllNotificationsRead`, `archiveAllNotifications`). No "seen" action is documented ([magicbell-js](https://www.magicbell.com/docs/libraries/magicbell-js)).
- **Styling:** importable stylesheets and CSS variables (for example `--magicbell-bg-default`), with a dark mode example ([React docs](https://www.magicbell.com/docs/libraries/magicbell-react)).
- **SSR / React 19:** not stated.

### Web push
- **Native browser Web Push with VAPID.** The `web_push` channel provider is configured with VAPID `public_key`/`private_key`. Tokens are the browser `PushSubscription` (endpoint + p256dh + auth). `WebPushButton` registers a service worker (default `/sw.js`) that imports MagicBell's script ([web push channel](https://www.magicbell.com/docs/channels/web_push); [React docs](https://www.magicbell.com/docs/libraries/magicbell-react); [API v2](https://www.magicbell.com/docs/api/reference)).
- Safari and iOS support is not stated on the channel page.

### Email
- Providers are SMTP, SendGrid, Amazon SES, Mailgun and "Ping Email". Ping Email is just an HTTP webhook ("URL to ping"), not a sender ([email](https://www.magicbell.com/docs/channels/email); [ping email](https://www.magicbell.com/docs/channels/email/ping_email)).
- **Postmark and Resend are not in the docs list.** There is no built-in sender.

### Preferences
- Categories × channels with an `enabled` flag, via `GET/PUT /v2/channels/user_preferences` with a User JWT ([API v2](https://www.magicbell.com/docs/api/reference)). Prebuilt `UserPreferences` React component ([React docs](https://www.magicbell.com/docs/libraries/magicbell-react)). No hosted preference page was found.

### Free tier (pricing page checked 2026-11-16)
- **Builder $0:** **1,000 deliveries/month**, **1 project**, all integrations, unlimited users and team members. Deliveries are counted per channel, so in-app plus email is 2 ([pricing](https://www.magicbell.com/pricing)).
- Startup is $249/month for 50k deliveries and 5 projects ([pricing](https://www.magicbell.com/pricing)).
- Whether a project has separate dev/prod environments was not verified.

### Node SDK
- `magicbell-js` v1.8.0 (`magicbell-js/project-client`, `user-client`) ([magicbell-js](https://www.magicbell.com/docs/libraries/magicbell-js); [npm](https://www.npmjs.com/package/magicbell-js)). The older `magicbell` v4.5.1 is still published ([npm](https://www.npmjs.com/package/magicbell)).

### Feed authentication
- A **User JWT** generated on your backend "using the Secret Key and the API Key from your project" ([auth](https://www.magicbell.com/docs/api/authentication)). The exact claims and algorithm are not on the reference page. A MagicBell blog sample uses HS256 with `user_external_id`/`api_key` ([blog](https://www.magicbell.com/blog/using-push-notifications-in-pwas)), but that is not a reference spec. Legacy v1 used an HMAC header ([v1 ref](https://www.magicbell.com/docs/rest-api/reference)).

### Notable
- The API was moved to v2 and v1 is deprecated ([API v2](https://www.magicbell.com/docs/api)). Several React packages coexist on npm, and `@magicbell/embeddable` is deprecated ([npm](https://www.npmjs.com/package/@magicbell/embeddable)).

---

## Comparison table

| Provider | Feed component | Real-time | Web push | Email providers | Preferences | Free tier (checked 2026-11-16) | Node SDK | Feed auth |
|---|---|---|---|---|---|---|---|---|
| **Knock** | Prebuilt popover/feed/bell + hooks (`@knocklabs/react` 0.15.1, React 17–19) | Socket (`listenForUpdates`) | **FCM only** (no first-party web push) | 12 incl. SES, Postmark, Resend, SendGrid; Knock sender testing-only | Workflow/category × channel type/channel; hosted page; hook (no drop-in component) | 10k msgs/mo, unlimited envs; no i18n | `@knocklabs/node` 1.41.1 | RS256 signed JWT (enhanced security) |
| **Novu Cloud** | Prebuilt `<Inbox />` + hooks (`@novu/react` 3.19.2, React 18–19) | WebSocket | **No native**; FCM, OneSignal, Pushpad, Pusher Beams, or webhook | 19 incl. SES, Postmark, Resend, SendGrid; demo 300/mo to own address | Global + per-workflow × channel; critical; UI in Inbox | 10k runs/mo, 5 workflows, 2 envs, 24h retention | `@novu/api` 3.19.1 | HMAC-SHA256 `subscriberHash` |
| **Courier** | Prebuilt `<CourierInbox />` (web-component wrapper, client-only) + `useCourier` (`@trycourier/courier-react` 9.3.5) | WebSocket | **No native**; FCM, OneSignal, Pusher Beams, etc. | 13 incl. SES, Postmark, Resend, SendGrid; no built-in | Topics (opt-in/out/required) × channel; `<CourierPreferences>` + hosted page | 10k sends/mo; test sends count; no EU | `@trycourier/courier` 10.0.0 | Courier-issued JWT (`/auth/issue-token`, scopes) |
| **SuprSend** | Prebuilt Inbox/Feed/Preferences + headless (`@suprsend/react` 1.5.0) | WebSocket | **Native VAPID** + service worker | SendGrid, SES, Mailgun, Resend, Postmark, Mailjet; Sandbox vendors | Global channel + category × channel; hosted + embedded | 10k notif/mo; **no preferences/digest on Free**; branding | `@suprsend/node-sdk` 1.15.1 | ES256 JWT user token (enhanced security) |
| **MagicBell** | Prebuilt Inbox/FloatingInbox/UserPreferences/WebPushButton (`@magicbell/react` 1.14.0) | WebSocket | **Native VAPID** + `WebPushButton` | SMTP, SendGrid, SES, Mailgun (no Postmark/Resend in docs) | Category × channel; `UserPreferences` component; no hosted page found | **1k deliveries/mo, 1 project** | `magicbell-js` 1.8.0 | User JWT (API key + secret) |

---

## Neutral shortlist (no winner chosen)

1. **SuprSend.** It is the only one with native VAPID web push, a prebuilt feed, a prebuilt preference UI, and separate Sandbox/Staging/Production workspaces, so the "one orchestrator" requirement is met literally.
   - *Trade-off:* the Free plan excludes user preferences and digests (Business is $250/month; a 30-day trial unlocks them). The free feed carries SuprSend branding. The inbox-channel preference is feature-flagged.
2. **Knock.** It has a mature React SDK with React 19 and React Router peer support, a rich preference model with a hosted page, unlimited free environments, RS256 JWT auth, and the widest email provider list (Postmark/Resend included).
   - *Trade-off:* no first-party web push. Browser push needs a Firebase project and the FCM web SDK in Cadence, which adds a second vendor (Google) to the push path.
3. **Novu Cloud** (or **Courier**, which has a similar profile).
   - Novu has the most flexible Inbox styling (Tailwind/CSS Modules), preferences built into the Inbox, React 19 support, and Dev + Prod environments on free. *Trade-off:* no native web push (FCM, Pushpad or OneSignal, each a separate account), a 5-workflow cap and 24h retention on free.
   - Courier has strong preferences (component plus hosted page). *Trade-off:* no native web push, test sends count against the quota, and the inbox renders client-side only.

**MagicBell** has native web push and prebuilt components, but its free tier is 1,000 per-channel deliveries and 1 project. Its email list lacks Postmark and Resend. These are worth weighing against its web-push strength.

---

## Sources

Knock
- https://knock.app/pricing
- https://docs.knock.app/in-app-ui/react/overview
- https://docs.knock.app/in-app-ui/react/feed
- https://docs.knock.app/in-app-ui/react/preferences
- https://docs.knock.app/in-app-ui/security-and-authentication
- https://docs.knock.app/integrations/push/overview
- https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm
- https://docs.knock.app/integrations/email/overview
- https://docs.knock.app/preferences/overview
- https://docs.knock.app/preferences/custom-preference-center
- https://docs.knock.app/send-notifications/message-statuses
- https://github.com/knocklabs/javascript/tree/main/packages/client
- https://www.npmjs.com/package/@knocklabs/react, https://www.npmjs.com/package/@knocklabs/node

Novu
- https://novu.co/pricing
- https://docs.novu.co/platform/inbox/overview
- https://docs.novu.co/platform/inbox/prepare-for-production
- https://docs.novu.co/platform/inbox/configuration/styling
- https://docs.novu.co/platform/sdks/react/hooks/use-notifications
- https://docs.novu.co/platform/concepts/preferences
- https://docs.novu.co/platform/integrations/push
- https://docs.novu.co/platform/integrations/push/push-webhook
- https://docs.novu.co/platform/integrations/push/pushpad
- https://docs.novu.co/platform/integrations/email
- https://docs.novu.co/platform/integrations/demo-integration
- https://www.npmjs.com/package/@novu/react, https://www.npmjs.com/package/@novu/api, https://www.npmjs.com/package/@novu/node, https://www.npmjs.com/package/@novu/notification-center

Courier
- https://www.courier.com/pricing
- https://www.courier.com/docs/workspaces/billing
- https://www.courier.com/docs/platform/inbox/inbox-overview
- https://www.courier.com/docs/sdk-libraries/courier-react-web
- https://www.courier.com/docs/sdk-libraries/courier-react-v8-migration-guide
- https://courier.com/docs/platform/inbox/authentication
- https://www.courier.com/docs/external-integrations/push/intro-to-push
- https://www.courier.com/docs/external-integrations/push/firebase-fcm
- https://courier.com/docs/external-integrations/email/intro-to-email
- https://www.courier.com/docs/platform/preferences/
- https://www.courier.com/docs/guides/build-a-preference-center#hosted-page
- https://www.courier.com/docs/sdk-libraries/node
- https://www.npmjs.com/package/@trycourier/courier-react, https://www.npmjs.com/package/@trycourier/courier

SuprSend
- https://www.suprsend.com/pricing
- https://docs.suprsend.com/docs/inbox-react
- https://docs.suprsend.com/docs/react-sdk
- https://docs.suprsend.com/docs/react-customize-inbox
- https://docs.suprsend.com/docs/react-headless
- https://docs.suprsend.com/docs/client-authentication
- https://docs.suprsend.com/docs/react-webpush
- https://docs.suprsend.com/docs/web-push-quick-start
- https://docs.suprsend.com/docs/vendors
- https://docs.suprsend.com/docs/email-vendor-integration
- https://docs.suprsend.com/docs/user-preferences
- https://docs.suprsend.com/docs/guides/modelling-customers-workspace-vs-tenant
- https://www.npmjs.com/package/@suprsend/react, https://www.npmjs.com/package/@suprsend/node-sdk

MagicBell
- https://www.magicbell.com/pricing
- https://www.magicbell.com/docs/libraries/magicbell-react
- https://www.magicbell.com/docs/libraries/magicbell-js
- https://www.magicbell.com/docs/channels/web_push
- https://www.magicbell.com/docs/channels/email
- https://www.magicbell.com/docs/channels/email/ping_email
- https://www.magicbell.com/docs/api/authentication
- https://www.magicbell.com/docs/api/reference
- https://www.npmjs.com/package/@magicbell/react, https://www.npmjs.com/package/magicbell-js
