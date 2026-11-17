// ─── Browser push state ───
// Which state this browser is in for web push (spec #21, "Browser push
// permission"; design: prototype/push-permission). Pure: the caller reads the
// facts from `window` and passes them in.

export const PUSH_STATES = [
  // Reading the browser (first render, and the server).
  "checking",
  // Cadence has no Knock push channel or Firebase keys configured.
  "unavailable",
  // The browser can push and nobody has answered its prompt yet.
  "not-asked",
  // Permission granted: registering this browser's token in Knock. Covers
  // "Allowed, token gone", which re-registers silently.
  "connecting",
  // Permission granted and the token is registered.
  "on",
  // Registering failed: "Couldn't connect this browser" + Try again.
  "connect-failed",
  // Permission granted, but the person turned push off for this browser.
  "off",
  // The person or the browser said no; only they can undo it.
  "denied",
  // iPhone/iPad in a normal Safari tab: no push APIs until it's on the Home Screen.
  "ios-tab",
  // Any other browser without Notification / service worker / PushManager.
  "unsupported",
] as const;

export type PushState = (typeof PUSH_STATES)[number];

export type BrowserFacts = {
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  isIOS: boolean;
  // Opened from the Home Screen as a web app.
  isStandalone: boolean;
  permission: NotificationPermission | null;
  // The per-browser "Turn off for this browser" flag.
  turnedOff: boolean;
};

// The state as far as the browser alone can tell. "on" and "connect-failed"
// come from registering the token afterwards.
export function pushStateFor(facts: BrowserFacts): PushState {
  const supported =
    facts.hasNotification && facts.hasServiceWorker && facts.hasPushManager;
  if (!supported) {
    return facts.isIOS && !facts.isStandalone ? "ios-tab" : "unsupported";
  }
  if (facts.permission === "denied") return "denied";
  if (facts.permission === "granted") {
    return facts.turnedOff ? "off" : "connecting";
  }
  return "not-asked";
}

// What the Notification Preferences card's Browser column needs: switches
// live only when push is on, otherwise one line naming the state.
export type BrowserColumn = { on: boolean; hint: string };

const HINTS: Record<PushState, string> = {
  checking: "Checking this browser…",
  unavailable: "Browser notifications aren't available right now.",
  "not-asked": "Browser notifications aren't on for this browser yet.",
  connecting: "Connecting this browser…",
  on: "Browser notifications are on for this browser.",
  "connect-failed": "Cadence couldn't connect this browser.",
  off: "You turned browser notifications off for this browser.",
  denied: "This browser is blocking notifications from Cadence.",
  "ios-tab": "On iPhone and iPad, add Cadence to your Home Screen first.",
  unsupported: "This browser can't show notifications.",
};

export function browserColumnFor(state: PushState): BrowserColumn {
  return { on: state === "on", hint: HINTS[state] };
}
