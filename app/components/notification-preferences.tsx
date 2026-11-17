import { useEffect, useMemo, useRef, useState } from "react";
import type { PreferenceSet } from "@knocklabs/client";
import { KnockProvider, useKnockClient } from "@knocklabs/react-core";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { KnockUserAuth } from "~/lib/knock-token.server";
import {
  readPreferences,
  withPreference,
  type KnockPreferences,
  type PreferenceChannel,
  type PreferenceRow,
  type SavedPreferences,
} from "~/lib/notification-preferences";
import {
  RENEW_BEFORE_EXPIRY_MS,
  useKnockUserToken,
} from "~/lib/use-knock-user-token";

// ─── Notification Preferences card ───
// Settings → #notification-preferences (design: prototype/notification-
// preferences, variant A). One row per Notification this person can receive,
// with Email and Browser switches. Each switch saves straight to the person's
// Knock preference set with their user token; there's no Save button.
//
// Knock's client only runs in the browser, so the server renders the
// defaults with every switch disabled, and the switches come alive once the
// saved preferences have loaded.

// This browser's push state, as far as the Browser column cares. Until web
// push ships (#30) it's never on, so the Browser switches stay greyed out.
export type BrowserNotificationsState = {
  on: boolean;
  // One line saying why the Browser switches don't do anything yet.
  hint: string;
};

const BROWSER_NOT_ON_YET: BrowserNotificationsState = {
  on: false,
  hint: "Browser notifications aren't on for this browser yet.",
};

export function NotificationPreferencesCard({
  userId,
  rows,
  knock,
  browser = BROWSER_NOT_ON_YET,
}: {
  userId: number;
  rows: PreferenceRow[];
  // Null when Knock isn't configured: the defaults show, read-only.
  knock: KnockUserAuth | null;
  browser?: BrowserNotificationsState;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card className="mt-8 max-w-2xl" id="notification-preferences">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Choose how you hear about each notification. Changes save as you make
          them.
        </p>
      </CardHeader>
      <CardContent>
        {mounted && knock ? (
          // Keyed by user, so a DevUI switch gets a new client and token.
          <ConnectedPreferences
            key={userId}
            userId={userId}
            rows={rows}
            knock={knock}
            browser={browser}
          />
        ) : (
          <PreferencesTable
            rows={rows}
            saved={readPreferences(rows, null)}
            browser={browser}
            unavailable={
              mounted
                ? "Notification Preferences can't be changed right now."
                : undefined
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Knock ───

function ConnectedPreferences({
  userId,
  rows,
  knock,
  browser,
}: {
  userId: number;
  rows: PreferenceRow[];
  knock: KnockUserAuth;
  browser: BrowserNotificationsState;
}) {
  const { userToken, renewToken } = useKnockUserToken(knock.userToken);
  const user = useMemo(() => ({ id: String(userId) }), [userId]);

  return (
    <KnockProvider
      apiKey={knock.publicApiKey}
      user={user}
      userToken={userToken}
      onUserTokenExpiring={renewToken}
      timeBeforeExpirationInMs={RENEW_BEFORE_EXPIRY_MS}
      // The settings loader upserts the person before this renders.
      identificationStrategy="skip"
    >
      <EditablePreferences rows={rows} browser={browser} />
    </KnockProvider>
  );
}

function EditablePreferences({
  rows,
  browser,
}: {
  rows: PreferenceRow[];
  browser: BrowserNotificationsState;
}) {
  const knock = useKnockClient();
  // The preference set as Knock last confirmed it. Saves run one at a time,
  // each building on the one before, because Knock replaces the whole set.
  const confirmed = useRef<KnockPreferences | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [current, setCurrent] = useState<KnockPreferences | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    knock.user.getPreferences().then(
      (preferences: PreferenceSet) => {
        if (cancelled) return;
        confirmed.current = preferences;
        setCurrent(preferences);
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("failed");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [knock]);

  const change = (
    row: PreferenceRow,
    channel: PreferenceChannel,
    value: boolean
  ) => {
    // Shown straight away; put back if Knock refuses it.
    setCurrent((shown) => withPreference(shown, row, channel, value));

    queue.current = queue.current.then(async () => {
      try {
        const saved = await knock.user.setPreferences(
          withPreference(confirmed.current, row, channel, value)
        );
        confirmed.current = saved;
        toast.success(
          `${row.name}: ${channel === "email" ? "email" : "browser notifications"} ${value ? "on" : "off"}`
        );
      } catch {
        setCurrent(confirmed.current);
        toast.error(`Couldn't save ${row.name}. Try again.`);
      }
    });
  };

  return (
    <PreferencesTable
      rows={rows}
      saved={readPreferences(rows, current)}
      browser={browser}
      onChange={status === "ready" ? change : undefined}
      unavailable={
        status === "failed"
          ? "Couldn't load your Notification Preferences. Reload to try again."
          : undefined
      }
    />
  );
}

// ─── Table ───

function PreferencesTable({
  rows,
  saved,
  browser,
  onChange,
  unavailable,
}: {
  rows: PreferenceRow[];
  saved: SavedPreferences;
  browser: BrowserNotificationsState;
  // Missing while loading, or when preferences can't be changed.
  onChange?: (
    row: PreferenceRow,
    channel: PreferenceChannel,
    value: boolean
  ) => void;
  unavailable?: string;
}) {
  const hasMandatoryEmail = rows.some((row) => row.email === "mandatory");
  const hasBrowserSwitch = rows.some((row) => row.browser !== "none");

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Notification</th>
            <th className="w-20 py-2 text-center font-medium">Email</th>
            <th className="w-24 py-2 text-center font-medium">Browser</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = saved[row.kind] ?? { email: false, browser: false };
            return (
              <tr key={row.kind} className="border-b last:border-0">
                <td className="py-3">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.description}
                  </div>
                </td>
                <td className="text-center">
                  {row.email === "mandatory" ? (
                    <span
                      className="inline-flex items-center gap-1"
                      title="Refund decisions are always emailed: they're about your money."
                    >
                      <Switch checked disabled label={`${row.name} email`} />
                      <Lock className="size-3 text-muted-foreground" />
                    </span>
                  ) : (
                    <Switch
                      checked={values.email}
                      disabled={!onChange}
                      onChange={(value) => onChange?.(row, "email", value)}
                      label={`${row.name} email`}
                    />
                  )}
                </td>
                <td className="text-center">
                  {row.browser === "none" ? (
                    <span
                      className="text-muted-foreground"
                      title="No browser notifications: seats are often claimed in bursts."
                    >
                      —
                    </span>
                  ) : (
                    <Switch
                      checked={values.browser}
                      disabled={!onChange || !browser.on}
                      onChange={(value) => onChange?.(row, "browser", value)}
                      label={`${row.name} browser notifications`}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 space-y-1 text-xs text-muted-foreground">
        <p>Every notification always appears in your Notification Feed.</p>
        {hasMandatoryEmail && (
          <p>
            <Lock className="inline size-3" /> Refund decisions are always
            emailed: they're about your money.
          </p>
        )}
        {hasBrowserSwitch && !browser.on && (
          <p className="text-amber-700 dark:text-amber-400">
            Browser: {browser.hint}{" "}
            <a href="#browser-notifications" className="underline">
              Browser notifications
            </a>
          </p>
        )}
        {unavailable && <p className="text-destructive">{unavailable}</p>}
      </div>
    </>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
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
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
