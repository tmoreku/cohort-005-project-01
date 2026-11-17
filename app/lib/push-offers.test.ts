import { describe, expect, it } from "vitest";
import { PUSH_STATES } from "./browser-push";
import {
  readPushOfferDismissal,
  shouldOfferPush,
  storedPushOfferDismissal,
} from "./push-offers";

const NOW = Date.UTC(2026, 10, 17, 12);

describe("shouldOfferPush", () => {
  it("offers in Not yet asked when the offer was never dismissed", () => {
    expect(shouldOfferPush("not-asked", null, NOW)).toBe(true);
  });

  it("offers in no other state", () => {
    const others = PUSH_STATES.filter((state) => state !== "not-asked");
    expect(others.filter((state) => shouldOfferPush(state, null, NOW))).toEqual(
      []
    );
  });

  it("rests for 30 days after Not now, then offers again", () => {
    const day = 24 * 60 * 60 * 1000;
    const notNow = { kind: "not-now", at: NOW } as const;
    expect(shouldOfferPush("not-asked", notNow, NOW + 29 * day)).toBe(false);
    expect(shouldOfferPush("not-asked", notNow, NOW + 30 * day + 1)).toBe(true);
  });

  it("never offers again after Don't ask again", () => {
    const year = 365 * 24 * 60 * 60 * 1000;
    expect(
      shouldOfferPush("not-asked", { kind: "never" }, NOW + 10 * year)
    ).toBe(false);
  });
});

describe("stored dismissals", () => {
  it("survive a reload", () => {
    const notNow = { kind: "not-now", at: NOW } as const;
    expect(readPushOfferDismissal(storedPushOfferDismissal(notNow))).toEqual(
      notNow
    );
    expect(
      readPushOfferDismissal(storedPushOfferDismissal({ kind: "never" }))
    ).toEqual({ kind: "never" });
  });

  it("read as not dismissed when nothing or nonsense is stored", () => {
    expect(readPushOfferDismissal(null)).toBeNull();
    expect(readPushOfferDismissal("soon")).toBeNull();
    expect(readPushOfferDismissal("")).toBeNull();
  });
});
