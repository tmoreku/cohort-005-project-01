import { describe, expect, it } from "vitest";
import { UserRole } from "~/db/schema";
import {
  preferenceRowsFor,
  readPreferences,
  withPreference,
} from "./notification-preferences";

const kindsFor = (person: Parameters<typeof preferenceRowsFor>[0]) =>
  preferenceRowsFor(person).map((row) => row.kind);

describe("preferenceRowsFor", () => {
  it("gives a Student the refund decisions and Discussion Reply", () => {
    expect(kindsFor({ role: UserRole.Student, isTeamAdmin: false })).toEqual([
      "refund-request-approved",
      "refund-request-declined",
      "discussion-reply",
    ]);
  });

  it("adds Seat claimed for a Student who is a Team Admin", () => {
    expect(kindsFor({ role: UserRole.Student, isTeamAdmin: true })).toEqual([
      "refund-request-approved",
      "refund-request-declined",
      "discussion-reply",
      "seat-claimed",
    ]);
  });

  it("gives an Instructor only Discussion Question asked", () => {
    expect(kindsFor({ role: UserRole.Instructor, isTeamAdmin: false })).toEqual(
      ["discussion-question-asked"]
    );
  });

  it("gives a Platform Admin only Refund Request opened", () => {
    expect(kindsFor({ role: UserRole.Admin, isTeamAdmin: false })).toEqual([
      "refund-request-opened",
    ]);
  });

  it("never has a row for Refund request received", () => {
    for (const role of Object.values(UserRole)) {
      for (const isTeamAdmin of [false, true]) {
        expect(kindsFor({ role, isTeamAdmin })).not.toContain(
          "refund-request-received"
        );
      }
    }
  });
});

const studentRows = preferenceRowsFor({
  role: UserRole.Student,
  isTeamAdmin: true,
});

describe("readPreferences", () => {
  it("shows the defaults to someone who has never saved a preference", () => {
    expect(readPreferences(studentRows, null)).toEqual({
      "refund-request-approved": { email: true, browser: true },
      "refund-request-declined": { email: true, browser: true },
      "discussion-reply": { email: true, browser: true },
      "seat-claimed": { email: false, browser: false },
    });
  });

  it("shows what the person saved per kind and channel", () => {
    const saved = readPreferences(studentRows, {
      workflows: {
        "discussion-reply": { channel_types: { email: false } },
        "seat-claimed": { channel_types: { email: true } },
        "refund-request-approved": { channel_types: { push: false } },
      },
    });
    expect(saved["discussion-reply"]).toEqual({ email: false, browser: true });
    expect(saved["seat-claimed"]).toEqual({ email: true, browser: false });
    expect(saved["refund-request-approved"]).toEqual({
      email: true,
      browser: false,
    });
  });

  it("reads a whole-workflow switch as both channels", () => {
    const saved = readPreferences(studentRows, {
      workflows: { "discussion-reply": false },
    });
    expect(saved["discussion-reply"]).toEqual({ email: false, browser: false });
  });

  it("keeps refund decision emails on whatever is saved", () => {
    const saved = readPreferences(studentRows, {
      workflows: {
        "refund-request-declined": { channel_types: { email: false } },
      },
    });
    expect(saved["refund-request-declined"]?.email).toBe(true);
  });
});

describe("withPreference", () => {
  const discussionReply = studentRows.find(
    (row) => row.kind === "discussion-reply"
  );
  const refundApproved = studentRows.find(
    (row) => row.kind === "refund-request-approved"
  );
  if (!discussionReply || !refundApproved) throw new Error("missing rows");

  it("writes one kind × channel and leaves everything else as saved", () => {
    const current = {
      workflows: {
        "discussion-reply": { channel_types: { push: false } },
        "seat-claimed": { channel_types: { email: true } },
      },
      categories: { marketing: false },
    };

    const next = withPreference(current, discussionReply, "email", false);

    expect(next).toEqual({
      workflows: {
        "discussion-reply": { channel_types: { push: false, email: false } },
        "seat-claimed": { channel_types: { email: true } },
      },
      categories: { marketing: false },
    });
    expect(readPreferences(studentRows, next)["discussion-reply"]).toEqual({
      email: false,
      browser: false,
    });
  });

  it("starts a preference set for someone who has none", () => {
    expect(withPreference(null, discussionReply, "browser", false)).toEqual({
      workflows: { "discussion-reply": { channel_types: { push: false } } },
    });
  });

  it("keeps the other channel of a whole-workflow switch", () => {
    const next = withPreference(
      { workflows: { "discussion-reply": false } },
      discussionReply,
      "email",
      true
    );
    expect(readPreferences(studentRows, next)["discussion-reply"]).toEqual({
      email: true,
      browser: false,
    });
  });

  it("refuses to change a mandatory email", () => {
    expect(() =>
      withPreference(null, refundApproved, "email", false)
    ).toThrow();
  });

  it("can still change the browser switch of a kind with mandatory email", () => {
    const next = withPreference(null, refundApproved, "browser", false);
    expect(
      readPreferences(studentRows, next)["refund-request-approved"]
    ).toEqual({ email: true, browser: false });
  });
});
