import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import type { BrowserPushConfig } from "~/lib/browser-push.server";
import { PUSH_STATES, pushStateFor, type PushState } from "~/lib/browser-push";

// ─── Browser push ───
// Web push for this browser (spec #21; design: prototype/push-permission).
// The provider works out this browser's push state once per signed-in
// person, and silently re-registers the token when permission is already
// granted (Knock drops tokens FCM rejects). The token comes from Firebase,
// requested with Cadence's own service worker (public/service-worker.js),
// which shows the pushes without the Firebase SDK.
//
// The browser's permission prompt only ever opens from a click on "Turn on".

// Per-browser "Turn off for this browser" flag: stops the silent re-register.
const TURNED_OFF_KEY = "cadence:browser-push:off";
// The user this browser's token was last registered to (for #31).
const REGISTERED_USER_KEY = "cadence:browser-push:user";
// Development only: force a state to see how the card renders it (DevUI).
const FORCED_STATE_KEY = "cadence:browser-push:force";

type BrowserPush = {
  state: PushState;
  // Set by the DevUI panel in development; actions do nothing while forced.
  forced: boolean;
  busy: boolean;
  turnOn: () => void;
  turnOff: () => void;
  sendTest: () => void;
};

const NO_PUSH: BrowserPush = {
  state: "unavailable",
  forced: false,
  busy: false,
  turnOn: () => {},
  turnOff: () => {},
  sendTest: () => {},
};

const BrowserPushContext = createContext<BrowserPush>(NO_PUSH);

export function useBrowserPush(): BrowserPush {
  return useContext(BrowserPushContext);
}

export function BrowserPushProvider({
  userId,
  config,
  children,
}: {
  userId: number | null;
  // Null when Knock push or Firebase isn't configured.
  config: BrowserPushConfig | null;
  children: React.ReactNode;
}) {
  if (userId === null) return <>{children}</>;
  return (
    // Keyed by user, so a DevUI switch starts again for the new person.
    <SignedInBrowserPush key={userId} userId={userId} config={config}>
      {children}
    </SignedInBrowserPush>
  );
}

function SignedInBrowserPush({
  userId,
  config,
  children,
}: {
  userId: number;
  config: BrowserPushConfig | null;
  children: React.ReactNode;
}) {
  const [detected, setDetected] = useState<PushState>("checking");
  const [forcedState, setForcedState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  const register = useCallback(
    async (pushConfig: BrowserPushConfig) => {
      setDetected("connecting");
      try {
        const token = await getFcmToken(pushConfig);
        await postBrowserPush({ intent: "register", token });
        localStorage.removeItem(TURNED_OFF_KEY);
        localStorage.setItem(REGISTERED_USER_KEY, String(userId));
        setDetected("on");
      } catch (error) {
        console.error("Couldn't connect this browser for push:", error);
        setDetected("connect-failed");
      }
    },
    [userId]
  );

  useEffect(() => {
    setForcedState(readForcedState());
    const onForced = () => setForcedState(readForcedState());
    window.addEventListener(FORCED_STATE_EVENT, onForced);

    if (!config) {
      setDetected("unavailable");
    } else {
      const state = pushStateFor(readBrowserFacts());
      setDetected(state);
      // Allowed: make sure this browser's token is (still) registered.
      if (state === "connecting") void register(config);
    }
    return () => window.removeEventListener(FORCED_STATE_EVENT, onForced);
  }, [config, register]);

  const forced = forcedState !== null;
  const state = forcedState ?? detected;

  const whileForced = () =>
    toast.info("A browser push state is forced in the DevUI panel.");

  const turnOn = () => {
    if (forced) return whileForced();
    if (!config || busy) return;
    if (detected !== "not-asked") {
      setBusy(true);
      void register(config).finally(() => setBusy(false));
      return;
    }
    setBusy(true);
    // Straight from the click: Safari and Firefox only prompt from a gesture.
    void Notification.requestPermission()
      .then(async (permission) => {
        if (permission === "granted") await register(config);
        else setDetected(pushStateFor(readBrowserFacts()));
      })
      .finally(() => setBusy(false));
  };

  const turnOff = () => {
    if (forced) return whileForced();
    if (!config || busy) return;
    setBusy(true);
    void (async () => {
      try {
        const token = await getFcmToken(config);
        await postBrowserPush({ intent: "unregister", token });
        localStorage.setItem(TURNED_OFF_KEY, "1");
        localStorage.removeItem(REGISTERED_USER_KEY);
        setDetected("off");
        toast.success("Browser notifications are off for this browser.");
      } catch (error) {
        console.error("Couldn't turn browser push off:", error);
        toast.error("Couldn't turn browser notifications off. Try again.");
      } finally {
        setBusy(false);
      }
    })();
  };

  const sendTest = () => {
    if (forced) return whileForced();
    if (busy) return;
    setBusy(true);
    postBrowserPush({ intent: "test" })
      .then(
        () =>
          toast.success(
            "Test notification sent. It can take a few seconds to arrive."
          ),
        () => toast.error("Couldn't send a test notification. Try again.")
      )
      .finally(() => setBusy(false));
  };

  return (
    <BrowserPushContext.Provider
      value={{ state, forced, busy, turnOn, turnOff, sendTest }}
    >
      {children}
    </BrowserPushContext.Provider>
  );
}

// ─── Browser ───

async function postBrowserPush(
  body:
    { intent: "register" | "unregister"; token: string } | { intent: "test" }
): Promise<void> {
  const response = await fetch("/api/browser-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`/api/browser-push ${body.intent}: ${response.status}`);
  }
}

function readBrowserFacts() {
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS reports itself as a Mac.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Safari's own flag for a Home Screen web app; not in the DOM types.
  const iosStandalone =
    "standalone" in navigator && navigator.standalone === true;
  return {
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    isIOS,
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      iosStandalone,
    permission: "Notification" in window ? Notification.permission : null,
    turnedOff: localStorage.getItem(TURNED_OFF_KEY) === "1",
  };
}

async function getFcmToken(config: BrowserPushConfig): Promise<string> {
  const registration =
    await navigator.serviceWorker.register("/service-worker.js");
  await navigator.serviceWorker.ready;
  const { getApps, initializeApp } = await import("firebase/app");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const app = getApps()[0] ?? initializeApp(config.firebase);
  return getToken(getMessaging(app), {
    vapidKey: config.vapidPublicKey,
    serviceWorkerRegistration: registration,
  });
}

// ─── Forcing a state (development) ───

const FORCED_STATE_EVENT = "cadence:browser-push:forced";

function readForcedState(): PushState | null {
  if (!import.meta.env.DEV) return null;
  const value = localStorage.getItem(FORCED_STATE_KEY);
  return PUSH_STATES.find((state) => state === value) ?? null;
}

export function forceBrowserPushState(state: PushState | null) {
  if (state) localStorage.setItem(FORCED_STATE_KEY, state);
  else localStorage.removeItem(FORCED_STATE_KEY);
  window.dispatchEvent(new Event(FORCED_STATE_EVENT));
}

// The DevUI panel's control for it.
export function ForceBrowserPushState() {
  const { state, forced } = useBrowserPush();
  return (
    <select
      aria-label="Browser push state"
      className="w-full rounded-md border bg-background px-2 py-1 text-xs"
      value={forced ? state : ""}
      onChange={(event) => {
        const value = event.target.value;
        forceBrowserPushState(
          PUSH_STATES.find((pushState) => pushState === value) ?? null
        );
      }}
    >
      <option value="">Real browser ({state})</option>
      {PUSH_STATES.map((pushState) => (
        <option key={pushState} value={pushState}>
          Force: {pushState}
        </option>
      ))}
    </select>
  );
}

// ─── Settings card ───
// Settings → #browser-notifications, just above Notification Preferences.

export function BrowserNotificationsCard() {
  const push = useBrowserPush();

  return (
    <Card className="mt-8 max-w-2xl" id="browser-notifications">
      <CardHeader>
        <h2 className="text-lg font-semibold">Browser notifications</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <BrowserNotificationsBody push={push} />
      </CardContent>
    </Card>
  );
}

function BrowserNotificationsBody({ push }: { push: BrowserPush }) {
  const { state, busy } = push;
  switch (state) {
    case "checking":
      return <Muted>Checking this browser…</Muted>;

    case "unavailable":
      return (
        <Muted>
          Browser notifications aren&apos;t available right now. You&apos;ll
          still get email, and everything stays in your Notification Feed.
        </Muted>
      );

    case "not-asked":
    case "off":
      return (
        <>
          <Muted>
            Get a pop-up on this device when something needs you, even when
            Cadence isn&apos;t open. You choose which Notifications pop up in
            Notification Preferences.
          </Muted>
          <Button onClick={push.turnOn} disabled={busy}>
            <Bell className="size-4" /> Turn on for this browser
          </Button>
          {state === "not-asked" && (
            <p className="text-xs text-muted-foreground">
              Your browser will ask you to confirm.
            </p>
          )}
        </>
      );

    case "connecting":
      return <Muted>Connecting this browser…</Muted>;

    case "on":
      return (
        <>
          <p className="text-sm">
            <span className="font-medium text-green-700 dark:text-green-400">
              On for this browser.
            </span>{" "}
            <span className="text-muted-foreground">
              Turn it on in each browser you use.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={push.sendTest} disabled={busy}>
              Send a test notification
            </Button>
            <Button variant="ghost" onClick={push.turnOff} disabled={busy}>
              <BellOff className="size-4" /> Turn off for this browser
            </Button>
          </div>
        </>
      );

    case "connect-failed":
      return (
        <>
          <p className="text-sm">
            Couldn&apos;t connect this browser to Cadence.
          </p>
          <Button variant="outline" onClick={push.turnOn} disabled={busy}>
            Try again
          </Button>
        </>
      );

    case "denied":
      return (
        <Muted>
          <span className="font-medium text-foreground">
            Blocked in this browser.
          </span>{" "}
          Cadence can&apos;t ask again. To allow it, click the icon to the left
          of the address bar, set <em>Notifications</em> to <em>Allow</em>, then
          reload. You&apos;ll still get email.
        </Muted>
      );

    case "ios-tab":
      return (
        <Muted>
          <Smartphone className="mr-1 inline size-4" />
          On iPhone and iPad, notifications only work once Cadence is on your
          Home Screen: tap <em>Share</em>, then <em>Add to Home Screen</em>, and
          open Cadence from there.
        </Muted>
      );

    case "unsupported":
      return (
        <Muted>
          This browser can&apos;t show notifications from Cadence. You&apos;ll
          still get email, and everything stays in your Notification Feed.
        </Muted>
      );
  }
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
