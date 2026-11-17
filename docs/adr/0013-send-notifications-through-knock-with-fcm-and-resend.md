# Send Notifications through Knock, with FCM for web push and Resend for email

Cadence uses Knock as its hosted notification orchestrator. Knock owns the Notification Feed, routing, Notification Preferences and email templates. Knock has no web push of its own, so web push goes through Firebase Cloud Messaging (FCM), which only delivers the push. Email goes out through Resend, set up as Knock's email provider. Knock is the only candidate whose free tier covers both Notification Preferences and separate development and production environments. With FCM, it is also the only setup that documents both using our own VAPID keys and removing dead push subscriptions.

Each Knock environment (Development, Production) connects to its own Firebase project (`cadence-dev`, `cadence-prod`). Each Firebase project has its own VAPID key pair, which we generate ourselves, keep with our secrets and import into Firebase. Knock's "Token deregistration" setting is on in both environments, so Knock removes invalid FCM tokens itself and Cadence has no cleanup code of its own.

## Considered Options

- **SuprSend.** It sends web push itself, but its free plan has no Notification Preferences, and its docs don't say whether we can bring our own VAPID keys.
- **MagicBell.** It sends web push itself with our own keys, but its free plan has only 1 project and 1k deliveries a month, so development and production can't be kept apart.
- **Novu Cloud, Courier.** They would need FCM for web push too, and they don't beat Knock on preferences or environments.
- **Postmark, SES or SendGrid for email.** Resend is simple to set up and its free tier covers development. Knock supports all four, so swapping later only means changing a provider setting.

## Consequences

- We run two vendors besides the email provider: Knock and Firebase.
- Safari's Declarative Web Push isn't available. Neither Knock nor FCM documents support for it, so Safari gets classic service-worker push. We'll check again if FCM adds support.
- The VAPID keys are ours, but the docs don't say whether FCM tokens can move to another sender. Leaving Firebase may still force every person to resubscribe to push.
- Leaving Knock means re-registering every recipient, rebuilding the Notification Feed UI and moving Notification Preferences.
