// PROTOTYPE (throwaway): Notification Preferences screen — wayfinder ticket #20.
//
// Three variants of the Notification Preferences section on /settings,
// switchable with ?variant=A|B|C and the floating bar (or ← / →):
//   A  Matrix: one table, kinds × Feed/Email/Browser; Browser notifications
//      card stays its own card above; instant save.
//   B  By channel: one "Notifications" card with Feed / Email / Browser
//      sections; the Browser notifications card is merged into the Browser
//      section; push switches disabled until push is on; Save button.
//   C  Sentences + chips: one row per Notification, grouped, with toggle
//      chips per channel; compact browser status line; instant save + Undo.
//
// The floating bar also simulates this browser's push state and lets you view
// the screen as any persona. Nothing is saved: preferences live in memory.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Bell, Check, ChevronLeft, ChevronRight, Lock, Mail, Monitor, Rss } from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  KINDS,
  PERSONA_LABELS,
  PUSH_STATES,
  PUSH_STATE_HINT,
  PUSH_STATE_LABELS,
  defaultPrefs,
  kindsFor,
  type Channel,
  type NotificationKind,
  type Persona,
  type Prefs,
  type PushState,
} from "./data";

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: "Matrix, instant save",
  B: "By channel, Save button",
  C: "Sentences + chips, undo",
};

// ─── shared prototype state ───────────────────────────────────────────────────

interface Proto {
  persona: Persona;
  setPersona: (p: Persona) => void;
  push: PushState;
  setPush: (s: PushState) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
}

const ProtoCtx = createContext<Proto | null>(null);

function useProto() {
  const p = useContext(ProtoCtx);
  if (!p) throw new Error("NotificationPreferencesPrototype missing");
  return p;
}

function initialPersona(role: string, isTeamAdmin: boolean): Persona {
  if (role === "admin") return "admin";
  if (role === "instructor") return "instructor";
  return isTeamAdmin ? "teamAdmin" : "student";
}

export function NotificationPreferencesPrototype({
  role,
  isTeamAdmin,
}: {
  role: string;
  isTeamAdmin: boolean;
}) {
  const [persona, setPersona] = useState<Persona>(initialPersona(role, isTeamAdmin));
  const [push, setPush] = useState<PushState>("not-asked");
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [searchParams] = useSearchParams();
  const v = searchParams.get("variant");
  const variant: Variant = VARIANTS.includes(v as Variant) ? (v as Variant) : "A";

  // Re-sync if DevUI switches user.
  useEffect(() => setPersona(initialPersona(role, isTeamAdmin)), [role, isTeamAdmin]);

  return (
    <ProtoCtx.Provider value={{ persona, setPersona, push, setPush, prefs, setPrefs }}>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      {process.env.NODE_ENV !== "production" && <PrototypeBar variant={variant} />}
    </ProtoCtx.Provider>
  );
}

// ─── shared bits ──────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const pushIsOn = (s: PushState) => s === "on";

// The #16 "Browser notifications" card, reduced to its states and buttons.
function BrowserNotificationsBody({ compact = false }: { compact?: boolean }) {
  const { push, setPush } = useProto();
  const text: Record<PushState, ReactNode> = {
    "not-asked": (
      <>
        <p>Get notifications on this device even when Cadence is closed.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setPush("on")}>
          Turn on for this browser
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">Your browser will ask you to confirm.</p>
      </>
    ),
    on: (
      <>
        <p>On for this browser.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => toast("🔔 Test notification from Cadence")}>
            Send a test notification
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPush("off")}>
            Turn off for this browser
          </Button>
        </div>
      </>
    ),
    off: (
      <>
        <p>Off for this browser.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setPush("on")}>
          Turn on for this browser
        </Button>
      </>
    ),
    denied: (
      <p>
        This browser is blocking notifications from Cadence. To allow them, click the icon left of
        the address bar, allow notifications, then reload. Email still arrives.
      </p>
    ),
    "ios-tab": (
      <p>
        On iPhone and iPad, tap Share → Add to Home Screen, then open Cadence from your Home
        Screen to turn on notifications.
      </p>
    ),
    unsupported: <p>This browser can't show notifications. Email and the Feed still work.</p>,
  };
  return <div className={compact ? "text-sm" : "space-y-1 text-sm"}>{text[push]}</div>;
}

function groupKinds(kinds: NotificationKind[]) {
  const groups = new Map<string, NotificationKind[]>();
  for (const k of kinds) groups.set(k.group, [...(groups.get(k.group) ?? []), k]);
  return [...groups.entries()];
}

function saveToast(kind: NotificationKind, channel: Channel, value: boolean) {
  toast.success(
    `${kind.name}: ${channel === "email" ? "email" : "browser notifications"} ${value ? "on" : "off"}`
  );
}

// ─── Variant A: matrix, instant save ──────────────────────────────────────────

function VariantA() {
  const { persona, push, prefs, setPrefs } = useProto();
  const kinds = kindsFor(persona);
  const set = (k: NotificationKind, c: Channel, v: boolean) => {
    setPrefs({ ...prefs, [k.key]: { ...prefs[k.key], [c]: v } });
    saveToast(k, c, v);
  };

  return (
    <>
      <Card className="mt-8 max-w-md" id="browser-notifications">
        <CardHeader>
          <h2 className="text-lg font-semibold">Browser notifications</h2>
        </CardHeader>
        <CardContent>
          <BrowserNotificationsBody />
        </CardContent>
      </Card>

      <Card className="mt-8 max-w-2xl" id="notification-preferences">
        <CardHeader>
          <h2 className="text-lg font-semibold">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground">
            Choose how you hear about each notification. Changes save as you make them.
          </p>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Notification</th>
                <th className="w-20 py-2 text-center font-medium">Feed</th>
                <th className="w-20 py-2 text-center font-medium">Email</th>
                <th className="w-24 py-2 text-center font-medium">Browser</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k.key} className="border-b last:border-0">
                  <td className="py-3">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-muted-foreground">{k.sentence}</div>
                  </td>
                  <td className="text-center" title="Every notification appears in your Feed.">
                    <Check className="mx-auto size-4 text-muted-foreground" />
                  </td>
                  <td className="text-center">
                    {k.email === "mandatory" ? (
                      <span className="inline-flex items-center gap-1" title={k.why}>
                        <Toggle checked disabled label={`${k.name} email`} />
                        <Lock className="size-3 text-muted-foreground" />
                      </span>
                    ) : (
                      <Toggle
                        checked={prefs[k.key].email}
                        onChange={(v) => set(k, "email", v)}
                        label={`${k.name} email`}
                      />
                    )}
                  </td>
                  <td className="text-center">
                    {k.push === "unavailable" ? (
                      <span className="text-muted-foreground" title={k.why}>
                        —
                      </span>
                    ) : (
                      <Toggle
                        checked={prefs[k.key].push}
                        onChange={(v) => set(k, "push", v)}
                        label={`${k.name} browser notification`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p>Feed: every notification always appears in your Notification Feed.</p>
            <p>
              <Lock className="inline size-3" /> Refund decisions are always emailed: they're about
              your money.
            </p>
            {!pushIsOn(push) && (
              <p className="text-amber-700 dark:text-amber-400">
                Browser: {PUSH_STATE_HINT[push]}{" "}
                <a href="#browser-notifications" className="underline">
                  Browser notifications
                </a>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Variant B: by channel, Save button ───────────────────────────────────────

function VariantB() {
  const { persona, push, prefs, setPrefs } = useProto();
  const kinds = kindsFor(persona);
  const [draft, setDraft] = useState<Prefs>(prefs);
  useEffect(() => setDraft(prefs), [prefs]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs);
  const set = (k: NotificationKind, c: Channel, v: boolean) =>
    setDraft({ ...draft, [k.key]: { ...draft[k.key], [c]: v } });
  const pushKinds = kinds.filter((k) => k.push !== "unavailable");
  const pushLive = pushIsOn(push);

  return (
    <Card className="mt-8 max-w-md" id="notification-preferences">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="flex items-center gap-2 font-medium">
            <Rss className="size-4" /> In Cadence
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Every notification appears in your Notification Feed. This can't be turned off.
          </p>
        </section>

        <section>
          <h3 className="flex items-center gap-2 font-medium">
            <Mail className="size-4" /> Email
          </h3>
          <ul className="mt-2 space-y-3">
            {kinds.map((k) => (
              <li key={k.key} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div>{k.sentence}</div>
                  {k.email === "mandatory" && (
                    <div className="text-xs text-muted-foreground">{k.why}</div>
                  )}
                </div>
                {k.email === "mandatory" ? (
                  <Lock className="mt-0.5 size-4 text-muted-foreground" aria-label="Always on" />
                ) : (
                  <Toggle
                    checked={draft[k.key].email}
                    onChange={(v) => set(k, "email", v)}
                    label={`${k.name} email`}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>

        <section id="browser-notifications">
          <h3 className="flex items-center gap-2 font-medium">
            <Monitor className="size-4" /> Browser notifications
          </h3>
          <div className="mt-2 rounded-md border bg-muted/40 p-3">
            <BrowserNotificationsBody />
          </div>
          {pushKinds.length > 0 && (
            <ul className={`mt-3 space-y-3 ${pushLive ? "" : "opacity-60"}`}>
              {pushKinds.map((k) => (
                <li key={k.key} className="flex items-start justify-between gap-3 text-sm">
                  <div>{k.sentence}</div>
                  <Toggle
                    checked={draft[k.key].push}
                    onChange={(v) => set(k, "push", v)}
                    disabled={!pushLive}
                    label={`${k.name} browser notification`}
                  />
                </li>
              ))}
            </ul>
          )}
          {!pushLive && pushKinds.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              These apply once browser notifications are on.
            </p>
          )}
        </section>

        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            disabled={!dirty}
            onClick={() => {
              setPrefs(draft);
              toast.success("Notification Preferences saved.");
            }}
          >
            Save preferences
          </Button>
          {dirty && (
            <>
              <Button variant="ghost" onClick={() => setDraft(prefs)}>
                Discard
              </Button>
              <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Variant C: sentences + chips, instant save with Undo ─────────────────────

function Chip({
  icon,
  label,
  on,
  locked,
  dim,
  title,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  locked?: boolean;
  dim?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={locked}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-dashed text-muted-foreground line-through"
      } ${locked ? "cursor-default" : "hover:bg-accent"} ${dim ? "opacity-50" : ""}`}
    >
      {icon}
      {label}
      {locked && <Lock className="size-3" />}
    </button>
  );
}

function VariantC() {
  const { persona, push, setPush, prefs, setPrefs } = useProto();
  const kinds = kindsFor(persona);
  const pushLive = pushIsOn(push);
  const set = (k: NotificationKind, c: Channel, v: boolean) => {
    const before = prefs;
    setPrefs({ ...prefs, [k.key]: { ...prefs[k.key], [c]: v } });
    toast(`${k.sentence}: ${c === "email" ? "email" : "browser"} ${v ? "on" : "off"}`, {
      action: { label: "Undo", onClick: () => setPrefs(before) },
    });
  };

  return (
    <Card className="mt-8 max-w-2xl" id="notification-preferences">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Tap a channel to turn it on or off. Everything also appears in your Feed.
        </p>
        <div
          id="browser-notifications"
          className="mt-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <span className="flex items-center gap-2">
            <Monitor className="size-4" />
            {PUSH_STATE_HINT[push]}
          </span>
          {(push === "not-asked" || push === "off") && (
            <Button size="sm" variant="outline" onClick={() => setPush("on")}>
              Turn on
            </Button>
          )}
          {push === "on" && (
            <Button size="sm" variant="ghost" onClick={() => setPush("off")}>
              Turn off
            </Button>
          )}
        </div>
        {(push === "denied" || push === "ios-tab" || push === "unsupported") && (
          <div className="mt-2 rounded-md bg-muted/50 p-3">
            <BrowserNotificationsBody compact />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {groupKinds(kinds).map(([group, ks]) => (
          <section key={group}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h3>
            <ul className="divide-y rounded-md border">
              {ks.map((k) => (
                <li key={k.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span className="text-sm">{k.sentence}</span>
                  <span className="flex flex-wrap gap-2">
                    <Chip icon={<Rss className="size-3" />} label="Feed" on locked title="Always in your Feed" />
                    <Chip
                      icon={<Mail className="size-3" />}
                      label="Email"
                      on={k.email === "mandatory" || prefs[k.key].email}
                      locked={k.email === "mandatory"}
                      title={k.why}
                      onClick={() => set(k, "email", !prefs[k.key].email)}
                    />
                    {k.push !== "unavailable" && (
                      <Chip
                        icon={<Bell className="size-3" />}
                        label="Browser"
                        on={prefs[k.key].push}
                        dim={!pushLive}
                        title={pushLive ? undefined : PUSH_STATE_HINT[push]}
                        onClick={() => set(k, "push", !prefs[k.key].push)}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── floating bar: variant, push-state simulator, persona ─────────────────────

function PrototypeBar({ variant }: { variant: Variant }) {
  const { persona, setPersona, push, setPush, setPrefs } = useProto();
  const [, setSearchParams] = useSearchParams();
  const cycle = (d: number) => {
    const i = VARIANTS.indexOf(variant);
    const next = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length];
    setSearchParams({ variant: next }, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-xs text-white shadow-lg">
      <span className="flex items-center gap-2">
        <button onClick={() => cycle(-1)} aria-label="Previous variant">
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-semibold">
          Prefs {variant} ({VARIANT_NAMES[variant]})
        </span>
        <button onClick={() => cycle(1)} aria-label="Next variant">
          <ChevronRight className="size-4" />
        </button>
      </span>
      <label className="flex items-center gap-1">
        Push:
        <select
          value={push}
          onChange={(e) => setPush(e.target.value as PushState)}
          className="rounded bg-zinc-800 px-1 py-0.5"
        >
          {PUSH_STATES.map((s) => (
            <option key={s} value={s}>
              {PUSH_STATE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        As:
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value as Persona)}
          className="rounded bg-zinc-800 px-1 py-0.5"
        >
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
            <option key={p} value={p}>
              {PERSONA_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <button className="underline" onClick={() => setPrefs(defaultPrefs())}>
        Reset
      </button>
      <span className="text-zinc-400">{KINDS.length} kinds · in memory</span>
    </div>
  );
}
