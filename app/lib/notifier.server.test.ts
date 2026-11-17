import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNotifier,
  fakeNotifier,
  sendNotification,
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

describe("sendNotification", () => {
  it("records the Notification locally when there is no Knock secret key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await sendNotification(
      discussionReply,
      createNotifier({ knockSecretApiKey: undefined, localDirectory: directory })
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

  it("keeps Notifications in memory with the fake notifier", async () => {
    const notifier = fakeNotifier();

    await sendNotification(discussionReply, notifier);

    expect(notifier.sent).toEqual([discussionReply]);
  });
});
