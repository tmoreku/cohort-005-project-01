import { describe, expect, it } from "vitest";
import { knockEnvironmentDefaults } from "./notification-catalogue";

describe("knockEnvironmentDefaults", () => {
  it("turns email on for every kind except Seat claimed, and browser push on where a kind has it", () => {
    expect(knockEnvironmentDefaults()).toEqual({
      workflows: {
        "refund-request-received": { channel_types: { email: true } },
        "refund-request-opened": { channel_types: { email: true, push: true } },
        "refund-request-approved": {
          channel_types: { email: true, push: true },
        },
        "refund-request-declined": {
          channel_types: { email: true, push: true },
        },
        "seat-claimed": { channel_types: { email: false } },
        "discussion-question-asked": {
          channel_types: { email: true, push: true },
        },
        "discussion-reply": { channel_types: { email: true, push: true } },
      },
    });
  });
});
