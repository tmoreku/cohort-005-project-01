import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { users } from "~/db/schema";

// ─── Notifications ───
// Cadence sends Notifications through Knock (docs/adr/0013). Domain functions
// return the Notifications to send; routes hand them to a Notifier.
//
// With KNOCK_SECRET_API_KEY set, the Knock notifier triggers one workflow per
// kind. Without it (fresh checkouts, tests), each Notification is written to
// .outbox/notifications/ as a JSON file instead, so nothing is sent and
// nothing throws.

// One Knock workflow per kind; the kind is the workflow key.
export type NotificationKind =
  | "refund-request-received"
  | "refund-request-opened"
  | "refund-request-approved"
  | "refund-request-declined"
  | "seat-claimed"
  | "discussion-question-asked"
  | "discussion-reply";

export type NotificationActor = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

export type NotificationToSend = {
  kind: NotificationKind;
  recipients: RecipientUser[];
  actor: NotificationActor;
  // The one target shared by the Feed row, the email button and push.
  url: string;
  // Kind-specific fields.
  data: Record<string, unknown>;
};

export interface Notifier {
  send(notification: NotificationToSend): Promise<void>;
}

// ─── Recipients ───

export type RecipientUser = Pick<
  typeof users.$inferSelect,
  "id" | "name" | "email" | "timezone" | "locale"
>;

// What Knock receives inline with each trigger; Knock upserts it.
export type KnockRecipient = {
  id: string;
  name: string;
  email?: string;
  timezone?: string;
  locale?: string;
};

export type RecipientOptions = {
  production: boolean;
  // Development only: every user's email goes here. Unset means no email, so
  // Knock skips the email step instead of mailing made-up seed addresses.
  devEmailTo?: string;
};

export function toKnockRecipient(
  user: RecipientUser,
  options: RecipientOptions
): KnockRecipient {
  const recipient: KnockRecipient = { id: String(user.id), name: user.name };

  const email = options.production ? user.email : options.devEmailTo;
  if (email) recipient.email = email;
  if (user.timezone) recipient.timezone = user.timezone;
  if (user.locale) recipient.locale = user.locale;

  return recipient;
}

// ─── Notifiers ───

const KNOCK_API_URL = "https://api.knock.app/v1";

// Knock's trigger endpoint is one POST, so this calls it with fetch rather
// than pulling in the Knock SDK — the same shape as the Postmark transport.
export function knockNotifier(
  secretApiKey: string,
  recipientOptions: RecipientOptions
): Notifier {
  return {
    async send(notification) {
      const { kind, recipients, actor, url, data } = notification;
      if (recipients.length === 0) return;

      const response = await fetch(
        `${KNOCK_API_URL}/workflows/${encodeURIComponent(kind)}/trigger`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretApiKey}`,
          },
          body: JSON.stringify({
            recipients: recipients.map((user) =>
              toKnockRecipient(user, recipientOptions)
            ),
            actor: { id: String(actor.id), name: actor.name },
            data: { ...data, actor, url },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Knock rejected the ${kind} workflow trigger: ${response.status}`
        );
      }
    },
  };
}

export type FakeNotifier = Notifier & { sent: NotificationToSend[] };

// Keeps every Notification in memory. Given a directory, it also writes each
// one there as a JSON file, which is how Cadence runs without Knock keys.
export function fakeNotifier(directory?: string): FakeNotifier {
  const sent: NotificationToSend[] = [];
  return {
    sent,
    async send(notification) {
      sent.push(notification);
      if (!directory) return;
      mkdirSync(directory, { recursive: true });
      const file = join(directory, `${Date.now()}-${notification.kind}.json`);
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

export type NotifierConfig = {
  knockSecretApiKey: string | undefined;
  localDirectory: string;
  production?: boolean;
  devEmailTo?: string;
};

export function createNotifier(config: NotifierConfig): Notifier {
  if (!config.knockSecretApiKey) return fakeNotifier(config.localDirectory);
  return knockNotifier(config.knockSecretApiKey, {
    production: config.production ?? false,
    devEmailTo: config.devEmailTo,
  });
}

function defaultNotifier(): Notifier {
  return createNotifier({
    knockSecretApiKey: process.env.KNOCK_SECRET_API_KEY,
    localDirectory: join(".outbox", "notifications"),
    production: process.env.NODE_ENV === "production",
    devEmailTo: process.env.DEV_EMAIL_TO,
  });
}

export async function sendNotification(
  notification: NotificationToSend,
  notifier: Notifier = defaultNotifier()
): Promise<void> {
  await notifier.send(notification);
}
