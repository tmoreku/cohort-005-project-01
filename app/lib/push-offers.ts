import type { PushState } from "./browser-push";

// ─── Proactive push offers ───
// Cadence offers browser push at moments it makes sense (spec #21; wording
// and rest/never rules: prototype/push-permission). Pure: the caller reads the
// push state and the stored dismissal and passes them in.

// "Not now" rests an offer for 30 days; "Don't ask again" hides it for good.
export type PushOfferDismissal =
  | { kind: "not-now"; at: number }
  | { kind: "never" }
  | null;

const REST_MS = 30 * 24 * 60 * 60 * 1000;

// Only when one click could actually turn push on, and the offer isn't
// resting or hidden.
export function shouldOfferPush(
  state: PushState,
  dismissal: PushOfferDismissal,
  now: number
): boolean {
  if (state !== "not-asked") return false;
  if (dismissal === null) return true;
  if (dismissal.kind === "never") return false;
  return now - dismissal.at > REST_MS;
}

// ─── Stored per browser (localStorage) ───
// "never", or when "Not now" was clicked, in ms since the epoch.

export function storedPushOfferDismissal(
  dismissal: NonNullable<PushOfferDismissal>
): string {
  return dismissal.kind === "never" ? "never" : String(dismissal.at);
}

export function readPushOfferDismissal(
  stored: string | null
): PushOfferDismissal {
  if (stored === "never") return { kind: "never" };
  if (!stored || !/^\d+$/.test(stored)) return null;
  return { kind: "not-now", at: Number(stored) };
}
