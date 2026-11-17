import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { users } from "~/db/schema";
import type { TimezoneAndLocale } from "~/lib/timezone-and-locale";

// ─── Notifications ───
// Cadence sends Notifications through Knock (docs/adr/0013). Domain functions
// return the Notifications to send; routes hand them to a Notifier.
//
// With KNOCK_SECRET_API_KEY set, the Knock notifier triggers one workflow per
// kind. Without it (fresh checkouts, tests), each Notification is written to
// .outbox/notifications/ as a JSON file instead, so nothing is sent and
// nothing throws. In production that fallback also logs an error, since it
// means nobody is being notified.

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

// Kind-specific fields. `actor` and `url` are top-level fields of every
// Notification and are added to the workflow data by the notifier, so the
// type keeps them out of here rather than letting one silently replace the
// other.
export type NotificationData = Record<string, unknown> & {
  actor?: never;
  url?: never;
};

export type NotificationToSend = {
  kind: NotificationKind;
  recipients: RecipientUser[];
  actor: NotificationActor;
  // The one target shared by the Feed row, the email button and push.
  url: string;
  data: NotificationData;
};

export interface Notifier {
  send(notification: NotificationToSend): Promise<void>;
}

// ─── Recipients ───

// A Cadence user a Notification goes to (the spec's name for it).
export type RecipientUser = Pick<
  typeof users.$inferSelect,
  "id" | "name" | "email"
> &
  TimezoneAndLocale;

// What Knock receives inline with each trigger; Knock upserts it. Unknown
// timezone and locale are left out rather than sent as null.
export type KnockRecipient = {
  id: string;
  name: string;
  email?: string;
} & { [K in keyof TimezoneAndLocale]?: NonNullable<TimezoneAndLocale[K]> };

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
            // NotificationData can't hold `actor` or `url`, so nothing in
            // `data` is overwritten here.
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

export type RecordingNotifier = Notifier & { sent: NotificationToSend[] };

// Keeps every Notification in memory. Given a directory, it also writes each
// one there as a JSON file, which is how Cadence runs without Knock keys.
export function recordingNotifier(directory?: string): RecordingNotifier {
  const sent: NotificationToSend[] = [];
  return {
    sent,
    async send(notification) {
      sent.push(notification);
      if (!directory) return;
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${randomUUID()}-${notification.kind}.json`
      );
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

export type NotifierConfig = {
  knockSecretApiKey: string | undefined;
  localDirectory: string;
} & RecipientOptions;

export function createNotifier(config: NotifierConfig): Notifier {
  if (!config.knockSecretApiKey) {
    // Sending happens after the database write, so this mustn't throw.
    if (config.production) {
      console.error(
        `KNOCK_SECRET_API_KEY is not set in production: Notifications are not being sent, only recorded in ${config.localDirectory}.`
      );
    }
    return recordingNotifier(config.localDirectory);
  }
  return knockNotifier(config.knockSecretApiKey, {
    production: config.production,
    devEmailTo: config.devEmailTo,
  });
}

// Built once, from the environment, when the server starts.
const defaultNotifier = createNotifier({
  knockSecretApiKey: process.env.KNOCK_SECRET_API_KEY,
  localDirectory: join(".outbox", "notifications"),
  production: process.env.NODE_ENV === "production",
  devEmailTo: process.env.DEV_EMAIL_TO,
});

// Creates or updates the person in Knock. Triggers carry recipients inline,
// so this is only needed before the browser talks to Knock as the person
// (Notification Preferences, push registration), which needs them to exist.
// Without KNOCK_SECRET_API_KEY it does nothing.
export async function upsertKnockRecipient(
  user: RecipientUser,
  config: Omit<NotifierConfig, "localDirectory"> = {
    knockSecretApiKey: process.env.KNOCK_SECRET_API_KEY,
    production: process.env.NODE_ENV === "production",
    devEmailTo: process.env.DEV_EMAIL_TO,
  }
): Promise<void> {
  if (!config.knockSecretApiKey) return;
  const { id, ...properties } = toKnockRecipient(user, config);

  const response = await fetch(
    `${KNOCK_API_URL}/users/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.knockSecretApiKey}`,
      },
      body: JSON.stringify(properties),
    }
  );

  if (!response.ok) {
    throw new Error(`Knock rejected the user upsert: ${response.status}`);
  }
}

export async function sendNotification(
  notification: NotificationToSend,
  notifier: Notifier = defaultNotifier
): Promise<void> {
  await notifier.send(notification);
}
