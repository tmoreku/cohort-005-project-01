// PROTOTYPE (throwaway): browser push permission — wayfinder ticket #16.
//
// Question: when, and from where, should Cadence ask a person to allow web
// push, and what does each browser state look like?
//
// The "Browser notifications" card in Settings exists in every variant: it's
// where push is turned on/off for good and where Blocked / iPhone / unsupported
// are explained. The variants disagree about the *proactive* ask:
//   A — Settings only. Cadence never asks unprompted.
//   B — Feed banner. A dismissible banner at the top of the Notification Feed
//       drawer (bell in the sidebar header; the drawer is a stub).
//   C — Contextual. Asks right after an action that implies wanting to hear
//       back: posting a Discussion Question (student), on Unanswered Questions
//       (instructor), on Refund Requests (Platform Admin).
//
// The floating bar switches variant (stored in localStorage so it survives
// navigation) and can simulate any browser state. "Real browser" mode does the
// real thing: service worker, FCM token with our VAPID key, token stored on the
// Knock user under channel `web-push-fcm`, test push through Knock.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Bell, BellOff, ChevronLeft, ChevronRight, Smartphone, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import {
  PUSH_STATES,
  PUSH_STATE_LABELS,
  canAskProactively,
  detectPushState,
  type PushState,
} from "./state";
import type { PrototypePushConfig } from "./config.server";

type Variant = "A" | "B" | "C";
const VARIANTS: Variant[] = ["A", "B", "C"];
const VARIANT_NAMES: Record<Variant, string> = {
  A: "Settings only",
  B: "Feed banner",
  C: "Contextual",
};

interface Ctx {
  variant: Variant;
  setVariant: (v: Variant) => void;
  simulated: PushState | null;
  setSimulated: (s: PushState | null) => void;
  state: PushState | "checking";
  optedOut: boolean;
  busy: boolean;
  error: string | null;
  log: string[];
  fakePromptOpen: boolean;
  answerFakePrompt: (allow: boolean) => void;
  turnOn: () => void;
  turnOff: () => void;
  sendTest: () => void;
  sendLocalTest: () => void;
  dismissedAt: number | null;
  dismiss: () => void;
  resetDismiss: () => void;
}

const PushCtx = createContext<Ctx | null>(null);
const usePush = () => useContext(PushCtx)!;

const ls = {
  get: (k: string) => (typeof window === "undefined" ? null : localStorage.getItem(k)),
  set: (k: string, v: string | null) =>
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v),
};

async function postPush(body: Record<string, string>) {
  const res = await fetch("/api/prototype-push", {
    method: "POST",
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

async function getFcmToken(config: PrototypePushConfig) {
  const reg = await navigator.serviceWorker.register("/prototype-push-sw.js");
  await navigator.serviceWorker.ready;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: config.apiKey,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
  return getToken(getMessaging(app), {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: reg,
  });
}

export function PushPrototypeProvider({
  config,
  userId,
  children,
}: {
  config: PrototypePushConfig;
  userId: number | null;
  children: React.ReactNode;
}) {
  const tokenKey = `proto-push-token:${userId}`;
  const offKey = `proto-push-off:${userId}`;
  const [variant, setVariantState] = useState<Variant>("A");
  const [simulated, setSimulatedState] = useState<PushState | null>(null);
  const [realState, setRealState] = useState<PushState | "checking">("checking");
  const [optedOut, setOptedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [fakePromptOpen, setFakePromptOpen] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const say = useCallback(
    (msg: string) =>
      setLog((l) => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 30)),
    []
  );

  useEffect(() => {
    setVariantState((ls.get("proto-push-variant") as Variant) ?? "A");
    setSimulatedState((ls.get("proto-push-sim") as PushState) || null);
    setDismissedAt(Number(ls.get("proto-push-dismissed")) || null);
  }, []);

  const setVariant = (v: Variant) => {
    ls.set("proto-push-variant", v);
    setVariantState(v);
  };
  const setSimulated = (s: PushState | null) => {
    ls.set("proto-push-sim", s);
    setSimulatedState(s);
    setError(null);
    say(s ? `simulating "${PUSH_STATE_LABELS[s]}"` : "using the real browser");
  };

  // ─── real browser detection ────────────────────────────────────────────────
  const detect = useCallback(async () => {
    if (!userId) return;
    setOptedOut(ls.get(offKey) === "1");
    const ua = navigator.userAgent;
    const isIOS =
      /iPhone|iPad|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const stored = ls.get(tokenKey);
    let hasRegisteredToken = false;
    if (stored) {
      try {
        const res = await fetch("/api/prototype-push");
        const json = await res.json();
        hasRegisteredToken = (json.tokens ?? []).includes(stored);
      } catch (e) {
        say(`couldn't read Knock tokens: ${(e as Error).message}`);
      }
    }
    const s = detectPushState({
      hasNotification: "Notification" in window,
      hasServiceWorker: "serviceWorker" in navigator,
      hasPushManager: "PushManager" in window,
      isIOS,
      isStandalone:
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
      permission: "Notification" in window ? Notification.permission : null,
      hasRegisteredToken,
    });
    setRealState(s);
    say(`real browser state: ${PUSH_STATE_LABELS[s]}`);
    return s;
  }, [userId, offKey, tokenKey, say]);

  const registerReal = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      say("getting FCM token…");
      const token = await getFcmToken(config);
      say(`FCM token ${token.slice(0, 16)}…`);
      await postPush({ intent: "register", token });
      ls.set(tokenKey, token);
      ls.set(offKey, null);
      setOptedOut(false);
      say("token stored on Knock user under web-push-fcm");
      await detect();
    } catch (e) {
      setError((e as Error).message);
      say(`register failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [config, tokenKey, offKey, say, detect]);

  useEffect(() => {
    detect().then((s) => {
      // Granted but the token is gone: re-register silently, no UI.
      if (s === "granted-no-token" && ls.get(offKey) !== "1") {
        say("permission granted but no token: re-registering silently");
        registerReal();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const state = simulated ?? realState;

  // ─── actions ───────────────────────────────────────────────────────────────
  const turnOn = async () => {
    if (simulated) {
      if (simulated === "not-asked") {
        say("browser prompt shown (simulated)");
        setFakePromptOpen(true);
      } else {
        setOptedOut(false);
        setSimulatedState("granted");
      }
      return;
    }
    if (realState === "granted" || realState === "granted-no-token") {
      return registerReal();
    }
    say("asking the browser…");
    const result = await Notification.requestPermission();
    say(`browser answered: ${result}`);
    if (result === "granted") await registerReal();
    else await detect();
  };

  const answerFakePrompt = (allow: boolean) => {
    setFakePromptOpen(false);
    say(`browser answered (simulated): ${allow ? "granted" : "denied"}`);
    setSimulatedState(allow ? "granted" : "denied");
  };

  const turnOff = async () => {
    if (simulated) {
      setOptedOut(true);
      say("turned off for this browser (simulated)");
      return;
    }
    const token = ls.get(tokenKey);
    setBusy(true);
    try {
      if (token) await postPush({ intent: "unregister", token });
      ls.set(offKey, "1");
      ls.set(tokenKey, null);
      setOptedOut(true);
      say("token removed from Knock; this browser is off");
      await detect();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (simulated) return say("test push needs Real browser mode");
    setBusy(true);
    setError(null);
    try {
      const json = await postPush({ intent: "test" });
      say(`Knock workflow triggered: ${JSON.stringify(json.raw)}`);
    } catch (e) {
      setError((e as Error).message);
      say(`test push failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const sendLocalTest = async () => {
    const reg = await navigator.serviceWorker.getRegistration("/prototype-push-sw.js");
    if (!reg || Notification.permission !== "granted")
      return say("local test needs permission granted and the service worker registered");
    await reg.showNotification("Local test (no Knock, no FCM)", {
      body: "The service worker can show notifications.",
      icon: "/favicon.svg",
      data: { url: "/settings" },
    });
    say("local notification shown");
  };

  const dismiss = () => {
    const now = Date.now();
    ls.set("proto-push-dismissed", String(now));
    setDismissedAt(now);
    say("ask dismissed: hidden for 30 days");
  };
  const resetDismiss = () => {
    ls.set("proto-push-dismissed", null);
    setDismissedAt(null);
    say("dismissal cleared");
  };

  if (!userId) return <>{children}</>;

  return (
    <PushCtx.Provider
      value={{
        variant,
        setVariant,
        simulated,
        setSimulated,
        state,
        optedOut,
        busy,
        error,
        log,
        fakePromptOpen,
        answerFakePrompt,
        turnOn,
        turnOff,
        sendTest,
        sendLocalTest,
        dismissedAt,
        dismiss,
        resetDismiss,
      }}
    >
      {children}
      {process.env.NODE_ENV !== "production" && <PrototypeBar />}
      {fakePromptOpen && <FakeBrowserPrompt />}
    </PushCtx.Provider>
  );
}

function useProactiveAsk() {
  const p = useContext(PushCtx);
  if (!p || p.state === "checking") return { show: false, p };
  return { show: canAskProactively(p.state, p.dismissedAt, Date.now()), p };
}

// ─── Settings card (every variant) ───────────────────────────────────────────

export function PushSettingsCard() {
  const p = useContext(PushCtx);
  if (!p) return null;
  const { state, optedOut, busy, error } = p;

  let body: React.ReactNode;
  if (state === "checking") body = <p className="text-sm text-muted-foreground">Checking this browser…</p>;
  else if (state === "not-asked" || ((state === "granted" || state === "granted-no-token") && optedOut))
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Get a pop-up on this device when something needs you, even when
          Cadence isn&apos;t open. You choose which Notifications pop up in
          Notification Preferences.
        </p>
        <Button onClick={p.turnOn} disabled={busy}>
          <Bell className="size-4" /> Turn on for this browser
        </Button>
        {state === "not-asked" && (
          <p className="text-xs text-muted-foreground">Your browser will ask you to confirm.</p>
        )}
      </>
    );
  else if (state === "granted")
    body = (
      <>
        <p className="text-sm">
          <span className="font-medium text-green-700 dark:text-green-400">On for this browser.</span>{" "}
          <span className="text-muted-foreground">
            Turn it on in each browser you use.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={p.sendTest} disabled={busy}>
            Send a test notification
          </Button>
          <Button variant="ghost" onClick={p.turnOff} disabled={busy}>
            <BellOff className="size-4" /> Turn off for this browser
          </Button>
        </div>
      </>
    );
  else if (state === "granted-no-token")
    body = error ? (
      <>
        <p className="text-sm">Couldn&apos;t connect this browser to Cadence.</p>
        <Button variant="outline" onClick={p.turnOn} disabled={busy}>Try again</Button>
      </>
    ) : (
      <p className="text-sm text-muted-foreground">Reconnecting this browser…</p>
    );
  else if (state === "denied")
    body = (
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Blocked in this browser.</span>{" "}
        Cadence can&apos;t ask again. To allow it, click the icon to the left of
        the address bar, set <em>Notifications</em> to <em>Allow</em>, then
        reload. You&apos;ll still get email.
      </p>
    );
  else if (state === "ios-tab")
    body = (
      <p className="text-sm text-muted-foreground">
        <Smartphone className="mr-1 inline size-4" />
        On iPhone and iPad, notifications only work once Cadence is on your
        Home Screen: tap <em>Share</em>, then <em>Add to Home Screen</em>, and
        open Cadence from there.
      </p>
    );
  else
    body = (
      <p className="text-sm text-muted-foreground">
        This browser can&apos;t show notifications from Cadence. You&apos;ll
        still get email, and everything stays in your Notification Feed.
      </p>
    );

  return (
    <Card className="mt-6 max-w-md ring-2 ring-fuchsia-400/60">
      <CardHeader>
        <h2 className="text-lg font-semibold">Browser notifications</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {body}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Variant B: bell + stub Feed drawer with a banner ────────────────────────

export function PushFeedSlot() {
  const p = useContext(PushCtx);
  const [open, setOpen] = useState(false);
  const { show } = useProactiveAsk();
  if (!p || p.variant !== "B") return null;
  return (
    <>
      <button
        className="ml-auto rounded-md p-1.5 hover:bg-sidebar-accent"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
      >
        <Bell className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-96 flex-col border-l bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between border-b px-4">
              <h2 className="font-semibold">Notifications</h2>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            {show && (
              <div className="m-3 rounded-lg border border-fuchsia-300 bg-fuchsia-50 p-3 dark:bg-fuchsia-950/30">
                <p className="text-sm font-medium">Don&apos;t miss these when Cadence is closed</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Turn on browser notifications for this device.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={p.turnOn} disabled={p.busy}>Turn on</Button>
                  <Button size="sm" variant="ghost" onClick={p.dismiss}>Not now</Button>
                </div>
              </div>
            )}
            <div className="flex-1 space-y-2 p-3 opacity-50">
              {["Refund Request approved", "Reply to your question", "New question on Lesson 3"].map((t) => (
                <div key={t} className="rounded-md border p-3 text-sm">
                  {t} <span className="text-xs text-muted-foreground">(Feed stub)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Variant C: contextual asks ──────────────────────────────────────────────

const CONTEXT_COPY = {
  discussion: {
    title: "Question posted.",
    body: "Want a notification on this device when someone replies?",
    cta: "Notify me",
  },
  "instructor-questions": {
    title: "Hear about new questions as they're asked",
    body: "Get a notification on this device when a student asks, even when Cadence is closed.",
    cta: "Turn on",
  },
  "admin-refunds": {
    title: "Hear about new Refund Requests",
    body: "Get a notification on this device when a buyer asks for a refund.",
    cta: "Turn on",
  },
} as const;

export function PushContextualAsk({ context }: { context: keyof typeof CONTEXT_COPY }) {
  const { show, p } = useProactiveAsk();
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (context !== "discussion") return;
    const on = () => setAsked(true);
    window.addEventListener("proto:question-asked", on);
    return () => window.removeEventListener("proto:question-asked", on);
  }, [context]);
  if (!p || p.variant !== "C" || !show) return null;
  if (context === "discussion" && !asked) return null;
  const copy = CONTEXT_COPY[context];
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-fuchsia-300 bg-fuchsia-50 p-4 dark:bg-fuchsia-950/30">
      <Bell className="mt-0.5 size-5 text-fuchsia-600" />
      <div className="flex-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>
      <Button size="sm" onClick={p.turnOn} disabled={p.busy}>{copy.cta}</Button>
      <Button size="sm" variant="ghost" onClick={p.dismiss}>No thanks</Button>
    </div>
  );
}

// ─── simulated browser prompt ────────────────────────────────────────────────

function FakeBrowserPrompt() {
  const p = usePush();
  return (
    <div className="fixed left-4 top-2 z-[60] w-80 rounded-md border bg-white p-4 text-sm text-black shadow-2xl">
      <p className="text-xs text-gray-500">Simulated browser prompt</p>
      <p className="mt-1 font-medium">{location.host} wants to</p>
      <p className="mt-1 flex items-center gap-2"><Bell className="size-4" /> Show notifications</p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded border px-3 py-1" onClick={() => p.answerFakePrompt(false)}>Block</button>
        <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => p.answerFakePrompt(true)}>Allow</button>
      </div>
    </div>
  );
}

// ─── floating prototype bar ──────────────────────────────────────────────────

function PrototypeBar() {
  const p = usePush();
  const [showLog, setShowLog] = useState(false);
  const i = VARIANTS.indexOf(p.variant);
  const cycle = (d: number) => p.setVariant(VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 text-xs">
      {showLog && (
        <div className="mb-2 max-h-60 w-[36rem] overflow-y-auto rounded-lg bg-zinc-900/95 p-3 font-mono text-[11px] text-zinc-100 shadow-xl">
          {p.log.length === 0 ? "nothing yet" : p.log.map((l, k) => <div key={k} className="break-all">{l}</div>)}
        </div>
      )}
      <div className="flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 text-white shadow-xl">
        <button onClick={() => cycle(-1)} aria-label="Previous variant"><ChevronLeft className="size-4" /></button>
        <span className="min-w-36 text-center font-medium">
          Push ask {p.variant} ({VARIANT_NAMES[p.variant]})
        </span>
        <button onClick={() => cycle(1)} aria-label="Next variant"><ChevronRight className="size-4" /></button>
        <span className="mx-1 h-4 w-px bg-zinc-600" />
        <select
          className="rounded bg-zinc-800 px-1 py-0.5"
          value={p.simulated ?? ""}
          onChange={(e) => p.setSimulated((e.target.value || null) as PushState | null)}
        >
          <option value="">Real browser</option>
          {PUSH_STATES.map((s) => (
            <option key={s} value={s}>Simulate: {PUSH_STATE_LABELS[s]}</option>
          ))}
        </select>
        <span className={cn("rounded px-1.5 py-0.5", p.state === "granted" ? "bg-green-700" : "bg-zinc-700")}>
          {p.state === "checking" ? "checking" : PUSH_STATE_LABELS[p.state]}
          {p.optedOut ? " · off here" : ""}
        </span>
        {p.dismissedAt && (
          <button className="underline" onClick={p.resetDismiss}>un-dismiss</button>
        )}
        <button className="underline" onClick={p.sendLocalTest}>local test</button>
        <button className="underline" onClick={() => setShowLog((s) => !s)}>log</button>
      </div>
    </div>
  );
}
