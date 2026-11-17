import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNotifier,
  recordingNotifier,
  sendNotifications,
  type Notifier,
  toKnockRecipient,
  type NotificationToSend,
  type RecipientUser,
} from "./notifier.server";

const emma: RecipientUser = {
  id: 42,
  name: "Emma Wilson",
  email: "emma.wilson@student.dev",
  timezone: "Europe/London",
  locale: "en-GB",
};

describe("toKnockRecipient", () => {
  it("uses the user id as a string and carries name, email, timezone and locale in production", () => {
    expect(toKnockRecipient(emma, { production: true })).toEqual({
      id: "42",
      name: "Emma Wilson",
      email: "emma.wilson@student.dev",
      timezone: "Europe/London",
      locale: "en-GB",
    });
  });

  it("leaves out a null timezone and locale", () => {
    expect(
      toKnockRecipient(
        { ...emma, timezone: null, locale: null },
        { production: true }
      )
    ).toEqual({
      id: "42",
      name: "Emma Wilson",
      email: "emma.wilson@student.dev",
    });
  });

  it("ignores DEV_EMAIL_TO in production", () => {
    expect(
      toKnockRecipient(emma, { production: true, devEmailTo: "me@dev.test" })
        .email
    ).toBe("emma.wilson@student.dev");
  });

  it("sends every user's email to DEV_EMAIL_TO in development", () => {
    expect(
      toKnockRecipient(emma, { production: false, devEmailTo: "me@dev.test" })
    ).toEqual({
      id: "42",
      name: "Emma Wilson",
      email: "me@dev.test",
      timezone: "Europe/London",
      locale: "en-GB",
    });
  });

  it("leaves out email in development when DEV_EMAIL_TO is not set", () => {
    const recipient = toKnockRecipient(emma, { production: false });
    expect(recipient).not.toHaveProperty("email");
    expect(recipient).toMatchObject({ id: "42", name: "Emma Wilson" });
  });

  it("treats an empty DEV_EMAIL_TO as not set", () => {
    expect(
      toKnockRecipient(emma, { production: false, devEmailTo: "" })
    ).not.toHaveProperty("email");
  });
});

const discussionReply: NotificationToSend = {
  kind: "discussion-reply",
  recipients: [emma],
  actor: { id: 7, name: "Sarah Chen", avatarUrl: null },
  url: "/courses/typescript/lessons/3#discussion-reply-9",
  data: { lessonTitle: "Generics" },
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sendNotifications", () => {
  it("records the Notification locally when there is no Knock secret key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await sendNotifications(
      [discussionReply],
      createNotifier({
        knockSecretApiKey: undefined,
        localDirectory: directory,
        production: false,
      })
    );

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toMatchObject({
      kind: "discussion-reply",
      url: "/courses/typescript/lessons/3#discussion-reply-9",
      recipients: [{ id: 42, name: "Emma Wilson" }],
    });
  });

  it("records two Notifications sent in the same millisecond as two files", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));
    const notifier = recordingNotifier(directory);

    await sendNotifications([discussionReply, discussionReply], notifier);

    expect(readdirSync(directory)).toHaveLength(2);
  });

  it("says loudly when production has no Knock secret key, without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    const notifier = createNotifier({
      knockSecretApiKey: undefined,
      localDirectory: directory,
      production: true,
    });
    await sendNotifications([discussionReply], notifier);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("KNOCK_SECRET_API_KEY")
    );
    expect(readdirSync(directory)).toHaveLength(1);
  });

  it("keeps Notifications in memory with the recording notifier", async () => {
    const notifier = recordingNotifier();

    await sendNotifications([discussionReply], notifier);

    expect(notifier.sent).toEqual([discussionReply]);
  });

  // Delivery isn't guaranteed (spec #21): the database write has already
  // happened, so a failed send is logged and never fails the request.
  it("sends every Notification even when one fails, and logs the failure without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recorded = recordingNotifier();
    const failsOnReceipt: Notifier = {
      async send(notification) {
        if (notification.kind === "refund-request-received") {
          throw new Error("Knock is down");
        }
        await recorded.send(notification);
      },
    };
    const receipt: NotificationToSend = {
      ...discussionReply,
      kind: "refund-request-received",
    };

    await expect(
      sendNotifications([receipt, discussionReply], failsOnReceipt)
    ).resolves.toBeUndefined();

    expect(recorded.sent).toEqual([discussionReply]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("refund-request-received"),
      expect.any(Error)
    );
  });
});

describe("NotificationToSend", () => {
  it("keeps actor and url out of the kind-specific data", () => {
    const withActorInData: NotificationToSend = {
      ...discussionReply,
      // @ts-expect-error actor is a top-level field, so data can't carry one
      data: { actor: "someone else" },
    };
    const withUrlInData: NotificationToSend = {
      ...discussionReply,
      // @ts-expect-error url is a top-level field, so data can't carry one
      data: { url: "/elsewhere" },
    };
    expect([withActorInData, withUrlInData]).toHaveLength(2);
  });
});
