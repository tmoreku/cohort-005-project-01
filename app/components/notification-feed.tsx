import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import type { FeedItem } from "@knocklabs/client";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
} from "@knocklabs/react-core";
import {
  Archive,
  Bell,
  CheckCheck,
  Circle,
  CircleDot,
  MessageSquare,
  Receipt,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { PushOffer } from "~/components/push-offer";
import {
  RENEW_BEFORE_EXPIRY_MS,
  useKnockUserToken,
} from "~/lib/use-knock-user-token";
import type { KnockFeedConfig } from "~/lib/knock-token.server";
import type { NotificationKind } from "~/lib/notifier.server";

// ─── Notification Feed ───
// A bell in the sidebar header and a "Notifications" sidebar item both open
// one right-hand drawer, built on Knock's headless hooks (design:
// prototype/notification-feed, variant B).
//
// Knock's client authenticates and opens a socket while rendering, so it
// only mounts in the browser, beside the page rather than around it. The
// bell and sidebar item read the unseen count through this file's own
// context, which the Knock subtree fills in once it's connected.

type FeedState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  unseenCount: number;
};

const FeedContext = createContext<FeedState | null>(null);

export function NotificationFeed({
  userId,
  config,
  children,
}: {
  // Null when nobody is signed in or Knock isn't configured: no Feed.
  userId: number | null;
  config: KnockFeedConfig | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A different person (DevUI switch, logout) starts with a closed drawer
  // and no count until their own Feed has loaded.
  useEffect(() => {
    setOpen(false);
    setUnseenCount(0);
  }, [userId]);

  const enabled = userId !== null && config !== null;
  const state = useMemo(
    () => (enabled ? { open, setOpen, unseenCount } : null),
    [enabled, open, unseenCount]
  );

  return (
    <FeedContext.Provider value={state}>
      {children}
      {mounted && enabled && (
        // Keyed by user, so a switch gets a new client, token and socket.
        <FeedConnection
          key={userId}
          userId={userId}
          config={config}
          open={open}
          onClose={() => setOpen(false)}
          onUnseenCountChange={setUnseenCount}
        />
      )}
    </FeedContext.Provider>
  );
}

// ─── Entry points ───

export function NotificationBell() {
  const feed = useContext(FeedContext);
  if (!feed) return null;
  return (
    <button
      type="button"
      onClick={() => feed.setOpen(true)}
      title="Notifications"
      aria-label={`Notifications${feed.unseenCount ? ` (${feed.unseenCount} new)` : ""}`}
      className={cn(
        "relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        feed.open && "bg-sidebar-accent"
      )}
    >
      <Bell className="size-4" />
      <CountBadge
        count={feed.unseenCount}
        className="absolute -right-1 -top-1"
      />
    </button>
  );
}

export function NotificationsNavItem() {
  const feed = useContext(FeedContext);
  if (!feed) return null;
  return (
    <button
      type="button"
      onClick={() => feed.setOpen(true)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        feed.open
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Bell className="size-4" />
      Notifications
      <CountBadge count={feed.unseenCount} className="ml-auto" />
    </button>
  );
}

function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Knock connection ───

function FeedConnection({
  userId,
  config,
  open,
  onClose,
  onUnseenCountChange,
}: {
  userId: number;
  config: KnockFeedConfig;
  open: boolean;
  onClose: () => void;
  onUnseenCountChange: (count: number) => void;
}) {
  const { userToken, renewToken } = useKnockUserToken(config.userToken);

  const user = useMemo(() => ({ id: String(userId) }), [userId]);

  return (
    <KnockProvider
      apiKey={config.publicApiKey}
      user={user}
      userToken={userToken}
      onUserTokenExpiring={renewToken}
      timeBeforeExpirationInMs={RENEW_BEFORE_EXPIRY_MS}
      // Cadence sends each recipient inline with every workflow trigger, so
      // the browser doesn't identify the user.
      identificationStrategy="skip"
    >
      <KnockFeedProvider feedId={config.feedChannelId}>
        <FeedDrawer
          open={open}
          onClose={onClose}
          onUnseenCountChange={onUnseenCountChange}
        />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

// ─── Drawer ───

const FRESH_MS = 4000;

function FeedDrawer({
  open,
  onClose,
  onUnseenCountChange,
}: {
  open: boolean;
  onClose: () => void;
  onUnseenCountChange: (count: number) => void;
}) {
  const { feedClient, useFeedStore } = useKnockFeed();
  const items = useFeedStore((state) => state.items);
  const unseenCount = useFeedStore((state) => state.metadata.unseen_count);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    void feedClient.fetch();
  }, [feedClient]);

  useEffect(() => {
    onUnseenCountChange(unseenCount);
  }, [unseenCount, onUnseenCountChange]);

  // Opening the drawer marks everything seen.
  useEffect(() => {
    if (open) void feedClient.markAllAsSeen();
  }, [open, feedClient]);

  // New arrivals slide in at the top, briefly highlighted. While the drawer
  // is open they've been seen, so the badge doesn't count them.
  useEffect(() => {
    const timeouts: number[] = [];
    const onArrival = ({ items: arrived }: { items: FeedItem[] }) => {
      if (arrived.length === 0) return;
      const ids = arrived.map((item) => item.id);
      setFreshIds((current) => new Set([...current, ...ids]));
      timeouts.push(
        window.setTimeout(
          () =>
            setFreshIds((current) => {
              const next = new Set(current);
              for (const id of ids) next.delete(id);
              return next;
            }),
          FRESH_MS
        )
      );
      if (openRef.current) void feedClient.markAsSeen(arrived);
    };
    feedClient.on("items.received.realtime", onArrival);
    return () => {
      feedClient.off("items.received.realtime", onArrival);
      for (const timeout of timeouts) window.clearTimeout(timeout);
    };
  }, [feedClient]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const visible = items.filter((item) => !item.archived_at);
  const today = visible.filter((item) => isToday(item.inserted_at));
  const earlier = visible.filter((item) => !isToday(item.inserted_at));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
      <div className="flex-1" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Notifications"
        className="flex h-full w-[28rem] max-w-full flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void feedClient.markAllAsRead()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all as read
            </button>
            <button type="button" onClick={onClose} title="Close">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PushOffer place="feed" className="m-3" />
          {visible.length === 0 && <EmptyState />}
          <FeedGroup
            label="Today"
            items={today}
            freshIds={freshIds}
            onOpen={onClose}
          />
          <FeedGroup
            label="Earlier"
            items={earlier}
            freshIds={freshIds}
            onOpen={onClose}
          />
        </div>
      </aside>
    </div>
  );
}

function FeedGroup({
  label,
  items,
  freshIds,
  onOpen,
}: {
  label: string;
  items: FeedItem[];
  freshIds: ReadonlySet<string>;
  onOpen: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="bg-muted/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {items.map((item) => (
        <FeedRow
          key={item.id}
          item={item}
          fresh={freshIds.has(item.id)}
          onOpen={onOpen}
        />
      ))}
    </section>
  );
}

function FeedRow({
  item,
  fresh,
  onOpen,
}: {
  item: FeedItem;
  fresh: boolean;
  onOpen: () => void;
}) {
  const { feedClient } = useKnockFeed();
  const navigate = useNavigate();
  const kind = kindOf(item);
  const { title, detail } = rowText(item);
  const actor = actorName(item);
  const unread = !item.read_at;

  function open() {
    if (unread) void feedClient.markAsRead(item);
    onOpen();
    const url = targetUrl(item);
    if (!url) return;
    if (url.startsWith("/")) navigate(url);
    else window.location.assign(url);
  }

  return (
    <div
      className={cn(
        "group flex gap-3 border-b px-5 py-4 transition-colors hover:bg-accent/50",
        fresh &&
          "bg-primary/10 animate-in fade-in slide-in-from-top-4 duration-500"
      )}
    >
      <button
        type="button"
        title={unread ? "Mark as read" : "Mark as unread"}
        onClick={() =>
          void (unread
            ? feedClient.markAsRead(item)
            : feedClient.markAsUnread(item))
        }
        className={cn(
          "mt-0.5 self-start text-primary transition-opacity",
          !unread && "opacity-0 group-hover:opacity-100"
        )}
      >
        {unread ? (
          <CircleDot className="size-3" />
        ) : (
          <Circle className="size-3 opacity-50" />
        )}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={open}>
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {KIND_META[kind].icon}
          <span>
            {KIND_META[kind].group}
            {actor && ` · ${actor}`} · {timeAgo(item.inserted_at)}
          </span>
        </div>
        <div className={cn("text-sm", unread && "font-semibold")}>{title}</div>
        {detail && (
          <div className="mt-1 line-clamp-3 rounded border-l-2 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
            {detail}
          </div>
        )}
      </button>
      <button
        type="button"
        title="Archive"
        onClick={() => void feedClient.markAsArchived(item)}
        className="self-start text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
      >
        <Archive className="size-4" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
      <Bell className="size-6 opacity-40" />
      You're all caught up.
    </div>
  );
}

// ─── Reading a Feed item ───

type KindGroup = "Refunds" | "Seats" | "Discussions" | "Notifications";

const KIND_META: Record<
  NotificationKind | "other",
  { icon: React.ReactNode; group: KindGroup }
> = {
  "refund-request-received": {
    icon: <Receipt className="size-3.5" />,
    group: "Refunds",
  },
  "refund-request-opened": {
    icon: <Receipt className="size-3.5" />,
    group: "Refunds",
  },
  "refund-request-approved": {
    icon: <Receipt className="size-3.5" />,
    group: "Refunds",
  },
  "refund-request-declined": {
    icon: <Receipt className="size-3.5" />,
    group: "Refunds",
  },
  "seat-claimed": { icon: <UsersRound className="size-3.5" />, group: "Seats" },
  "discussion-question-asked": {
    icon: <MessageSquare className="size-3.5" />,
    group: "Discussions",
  },
  "discussion-reply": {
    icon: <MessageSquare className="size-3.5" />,
    group: "Discussions",
  },
  other: { icon: <Bell className="size-3.5" />, group: "Notifications" },
};

function isKnownKind(key: string): key is NotificationKind {
  return key !== "other" && key in KIND_META;
}

// The workflow key is the Notification kind.
function kindOf(item: FeedItem): NotificationKind | "other" {
  const key = item.source.key;
  return isKnownKind(key) ? key : "other";
}

function dataField(item: FeedItem, field: string): unknown {
  return item.data ? item.data[field] : undefined;
}

function targetUrl(item: FeedItem): string | null {
  const url = dataField(item, "url");
  if (typeof url !== "string" || url === "") return null;
  // Same-origin absolute URLs (as emails need them) navigate in-app.
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function actorName(item: FeedItem): string | null {
  const [first] = item.actors;
  if (first && "name" in first && typeof first.name === "string") {
    return first.name;
  }
  const actor = dataField(item, "actor");
  if (
    typeof actor === "object" &&
    actor !== null &&
    "name" in actor &&
    typeof actor.name === "string"
  ) {
    return actor.name;
  }
  return null;
}

// The in-app step's body: its first paragraph is the Feed title, and any
// further paragraphs make the optional detail line.
function rowText(item: FeedItem): { title: string; detail: string | null } {
  const block =
    item.blocks.find((b) => b.name === "body") ?? item.blocks[0] ?? null;
  if (!block || block.type === "button_set") {
    return { title: "New notification", detail: null };
  }
  const html = new DOMParser().parseFromString(block.rendered, "text/html");
  const paragraphs = Array.from(html.body.children)
    .map((element) => element.textContent?.trim() ?? "")
    .filter((text) => text !== "");
  const [title = html.body.textContent?.trim() || "New notification", ...rest] =
    paragraphs;
  return { title, detail: rest.length > 0 ? rest.join(" ") : null };
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
