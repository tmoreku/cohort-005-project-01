import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useBrowserPush } from "~/components/browser-notifications";
import {
  readPushOfferDismissal,
  shouldOfferPush,
  storedPushOfferDismissal,
  type PushOfferDismissal,
} from "~/lib/push-offers";
import { cn } from "~/lib/utils";

// ─── Proactive push offers ───
// Shown only in "Not yet asked" (spec #21; wording: prototype/push-permission).
// The button is the Browser notifications card's "Turn on", so the browser's
// prompt opens straight from the click. Each offer is dismissed on its own,
// per browser.

export type PushOfferPlace =
  | "feed"
  | "discussion-question"
  | "unanswered-questions"
  | "refund-requests";

const COPY: Record<PushOfferPlace, { title: string; body: string; cta: string }> =
  {
    feed: {
      title: "Don't miss these when Cadence is closed",
      body: "Turn on browser notifications for this device.",
      cta: "Turn on",
    },
    "discussion-question": {
      title: "Question posted.",
      body: "Want a notification on this device when someone replies?",
      cta: "Notify me",
    },
    "unanswered-questions": {
      title: "Hear about new questions as they're asked",
      body: "Get a notification on this device when a student asks, even when Cadence is closed.",
      cta: "Turn on",
    },
    "refund-requests": {
      title: "Hear about new Refund Requests",
      body: "Get a notification on this device when a buyer asks for a refund.",
      cta: "Turn on",
    },
  };

const storageKey = (place: PushOfferPlace) => `cadence:push-offer:${place}`;

export function PushOffer({
  place,
  className,
}: {
  place: PushOfferPlace;
  className?: string;
}) {
  const push = useBrowserPush();
  // Read after mount: localStorage doesn't exist on the server.
  const [dismissal, setDismissal] = useState<PushOfferDismissal | "reading">(
    "reading"
  );

  useEffect(() => {
    setDismissal(readPushOfferDismissal(localStorage.getItem(storageKey(place))));
  }, [place]);

  if (dismissal === "reading") return null;
  if (!shouldOfferPush(push.state, dismissal, Date.now())) return null;

  const dismiss = (next: NonNullable<PushOfferDismissal>) => {
    localStorage.setItem(storageKey(place), storedPushOfferDismissal(next));
    setDismissal(next);
  };

  const copy = COPY[place];
  const stacked = place === "feed";

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 p-4",
        !stacked && "flex flex-wrap items-start gap-3",
        className
      )}
    >
      {!stacked && <Bell className="mt-0.5 size-5 text-primary" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
      </div>
      <div className={cn("flex flex-wrap gap-2", stacked && "mt-3")}>
        <Button size="sm" onClick={push.turnOn} disabled={push.busy}>
          {copy.cta}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => dismiss({ kind: "not-now", at: Date.now() })}
        >
          Not now
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dismiss({ kind: "never" })}>
          Don&apos;t ask again
        </Button>
      </div>
    </div>
  );
}
