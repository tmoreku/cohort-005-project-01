// PROTOTYPE (throwaway): browser push permission — wayfinder ticket #16.
//
// Pure: works out which of the push states this browser is in. No DOM access;
// the caller passes in what it read from `window`.

export type PushState =
  | "ios-tab" // iPhone/iPad in a normal Safari tab: push APIs don't exist until added to the Home Screen
  | "unsupported" // any other browser without Notification / service worker / PushManager
  | "not-asked" // Notification.permission === "default"
  | "denied" // the person or the browser said no; only they can undo it
  | "granted-no-token" // permission granted, but this browser has no token registered in Knock
  | "granted"; // permission granted and a token is registered

export const PUSH_STATES: PushState[] = [
  "not-asked",
  "granted",
  "granted-no-token",
  "denied",
  "ios-tab",
  "unsupported",
];

export const PUSH_STATE_LABELS: Record<PushState, string> = {
  "not-asked": "Not yet asked",
  granted: "Allowed, token registered",
  "granted-no-token": "Allowed, token gone",
  denied: "Blocked",
  "ios-tab": "iPhone/iPad tab (not on Home Screen)",
  unsupported: "Browser can't do push",
};

export interface BrowserFacts {
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: "default" | "granted" | "denied" | null;
  hasRegisteredToken: boolean;
}

export function detectPushState(f: BrowserFacts): PushState {
  const supported = f.hasNotification && f.hasServiceWorker && f.hasPushManager;
  if (!supported) return f.isIOS && !f.isStandalone ? "ios-tab" : "unsupported";
  if (f.permission === "denied") return "denied";
  if (f.permission === "granted")
    return f.hasRegisteredToken ? "granted" : "granted-no-token";
  return "not-asked";
}

// Should a proactive ask (Feed banner, contextual card) show at all?
// Only when one click could actually turn push on.
// dismissedAt = Infinity means "Don't ask again" (hidden for good);
// a timestamp means "Not now" (resting for 30 days).
export function canAskProactively(state: PushState, dismissedAt: number | null, now: number) {
  if (state !== "not-asked") return false;
  if (dismissedAt === null) return true;
  if (dismissedAt === Infinity) return false;
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  return now - dismissedAt > THIRTY_DAYS;
}
