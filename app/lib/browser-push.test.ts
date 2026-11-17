import { describe, expect, it } from "vitest";
import {
  browserColumnFor,
  pushStateFor,
  type BrowserFacts,
} from "./browser-push";

const chrome: BrowserFacts = {
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  isIOS: false,
  isStandalone: false,
  permission: "default",
  turnedOff: false,
};

describe("pushStateFor", () => {
  it("is not asked when the browser can push and nobody has answered", () => {
    expect(pushStateFor(chrome)).toBe("not-asked");
  });

  it("is blocked when permission was denied", () => {
    expect(pushStateFor({ ...chrome, permission: "denied" })).toBe("denied");
  });

  it("connects when permission is granted, so a lost token is re-registered", () => {
    expect(pushStateFor({ ...chrome, permission: "granted" })).toBe(
      "connecting"
    );
  });

  it("is off when granted but turned off for this browser", () => {
    expect(
      pushStateFor({ ...chrome, permission: "granted", turnedOff: true })
    ).toBe("off");
  });

  it("asks again when turned off but permission is back to unanswered", () => {
    expect(pushStateFor({ ...chrome, turnedOff: true })).toBe("not-asked");
  });

  it("is an iPhone/iPad tab when push APIs are missing on iOS outside the Home Screen", () => {
    expect(
      pushStateFor({
        ...chrome,
        hasNotification: false,
        hasPushManager: false,
        isIOS: true,
        permission: null,
      })
    ).toBe("ios-tab");
  });

  it("is unsupported on iOS from the Home Screen without push APIs (iOS before 16.4)", () => {
    expect(
      pushStateFor({
        ...chrome,
        hasPushManager: false,
        isIOS: true,
        isStandalone: true,
      })
    ).toBe("unsupported");
  });

  it("is unsupported on any other browser without a push API", () => {
    expect(pushStateFor({ ...chrome, hasServiceWorker: false })).toBe(
      "unsupported"
    );
  });
});

describe("browserColumnFor", () => {
  it("turns the Browser column on only when push is on for this browser", () => {
    expect(browserColumnFor("on")).toEqual({
      on: true,
      hint: "Browser notifications are on for this browser.",
    });
  });

  it("names the state when it greys the column out", () => {
    expect(browserColumnFor("not-asked")).toEqual({
      on: false,
      hint: "Browser notifications aren't on for this browser yet.",
    });
    expect(browserColumnFor("off").hint).toBe(
      "You turned browser notifications off for this browser."
    );
    expect(browserColumnFor("denied").hint).toBe(
      "This browser is blocking notifications from Cadence."
    );
    expect(browserColumnFor("ios-tab").hint).toBe(
      "On iPhone and iPad, add Cadence to your Home Screen first."
    );
    expect(browserColumnFor("unsupported").hint).toBe(
      "This browser can't show notifications."
    );
    expect(browserColumnFor("connect-failed").hint).toBe(
      "Cadence couldn't connect this browser."
    );
  });
});
