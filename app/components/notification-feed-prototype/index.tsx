// PROTOTYPE (throwaway): Notification Feed — wayfinder ticket #11.
//
// Three variants of where the Notification Feed lives in Cadence, switchable
// via `?variant=A|B|C` on any page under the app layout:
//   A — Bell in the sidebar header opening a popover (Knock's prebuilt
//       NotificationIconButton + NotificationFeedPopover shape)
//   B — "Notifications" sidebar item opening a right-hand slide-over drawer
//       (custom UI over Knock's headless useNotifications/useNotificationStore)
//   C — "Notifications" sidebar item opening a full inbox page with filters
//       and bulk actions (custom UI over the same Knock hooks)
//
// Assumption: no Knock connection. Data is in-memory stubs shaped like Knock
// FeedItems (seen_at / read_at / archived_at). The floating bar lets you
// simulate a real-time arrival and flip the badge between unseen and unread
// counts (Knock's `badgeCountType`). Not for production.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Archive,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  MessageSquare,
  Receipt,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type {
  ProtoNotification,
  ProtoNotificationKind,
} from "./data.server";

// ─── shared store ────────────────────────────────────────────────────────────

type BadgeMode = "unseen" | "unread";

interface Store {
  items: ProtoNotification[];
  freshIds: Set<string>;
  badgeMode: BadgeMode;
  toastOnArrival: boolean;
  badgeCount: number;
  remainingIncoming: number;
  setBadgeMode: (m: BadgeMode) => void;
  setToastOnArrival: (b: boolean) => void;
  simulateIncoming: () => void;
  markAllSeen: () => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  archive: (id: string) => void;
  open: (n: ProtoNotification) => void;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);
const useStore = () => useContext(StoreContext)!;

const now = () => new Date().toISOString();

function NotificationStoreProvider({
  initial,
  incoming,
  children,
}: {
  initial: ProtoNotification[];
  incoming: ProtoNotification[];
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState(initial);
  const [queue, setQueue] = useState(incoming);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [badgeMode, setBadgeMode] = useState<BadgeMode>("unseen");
  const [toastOnArrival, setToastOnArrival] = useState(false);

  // Switching users in the DevUI changes the stub set.
  const key = initial.map((i) => i.title).join("|");
  useEffect(() => {
    setItems(initial);
    setQueue(incoming);
    setFreshIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const visible = items.filter((i) => !i.archivedAt);
  const badgeCount = visible.filter((i) =>
    badgeMode === "unseen" ? !i.seenAt : !i.readAt
  ).length;

  const patch = (
    pred: (n: ProtoNotification) => boolean,
    fn: (n: ProtoNotification) => Partial<ProtoNotification>
  ) => setItems((xs) => xs.map((x) => (pred(x) ? { ...x, ...fn(x) } : x)));

  const store: Store = {
    items: visible,
    freshIds,
    badgeMode,
    toastOnArrival,
    badgeCount,
    remainingIncoming: queue.length,
    setBadgeMode,
    setToastOnArrival,
    simulateIncoming() {
      const [next, ...rest] = queue;
      if (!next) return;
      const arrived = { ...next, insertedAt: now() };
      setQueue(rest);
      setItems((xs) => [arrived, ...xs]);
      setFreshIds((s) => new Set(s).add(arrived.id));
      setTimeout(
        () =>
          setFreshIds((s) => {
            const c = new Set(s);
            c.delete(arrived.id);
            return c;
          }),
        4000
      );
      if (toastOnArrival) {
        toast(arrived.title, {
          action: { label: "Open", onClick: () => store.open(arrived) },
        });
      }
    },
    markAllSeen: () => patch((x) => !x.seenAt, () => ({ seenAt: now() })),
    markRead: (id) =>
      patch(
        (x) => x.id === id,
        (x) => ({ readAt: now(), seenAt: x.seenAt ?? now() })
      ),
    markUnread: (id) => patch((x) => x.id === id, () => ({ readAt: null })),
    markAllRead: () =>
      patch(
        (x) => !x.readAt,
        (x) => ({ readAt: now(), seenAt: x.seenAt ?? now() })
      ),
    archive: (id) => patch((x) => x.id === id, () => ({ archivedAt: now() })),
    open(n) {
      store.markRead(n.id);
      const p = new URLSearchParams(window.location.search);
      p.delete("inbox");
      navigate(`${n.href}?${p}`);
    },
    reset() {
      setItems(initial);
      setQueue(incoming);
      setFreshIds(new Set());
    },
  };

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────────

const kindMeta: Record<
  ProtoNotificationKind,
  { icon: React.ReactNode; group: "Refunds" | "Discussions" | "Seats" }
> = {
  refund_opened: { icon: <Receipt className="size-4" />, group: "Refunds" },
  refund_approved: { icon: <Receipt className="size-4" />, group: "Refunds" },
  refund_declined: { icon: <Receipt className="size-4" />, group: "Refunds" },
  seat_claimed: { icon: <UsersRound className="size-4" />, group: "Seats" },
  question_asked: {
    icon: <MessageSquare className="size-4" />,
    group: "Discussions",
  },
  reply_posted: {
    icon: <MessageSquare className="size-4" />,
    group: "Discussions",
  },
};

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Badge({ count, className }: { count: number; className?: string }) {
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
      <Bell className="size-6 opacity-40" />
      You're all caught up.
    </div>
  );
}

// ─── Variant A: bell + popover ───────────────────────────────────────────────

function VariantAHeaderSlot() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    s.markAllSeen(); // Knock's popover marks everything seen on open
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // New arrivals while open are seen immediately.
  useEffect(() => {
    if (open && s.items.some((i) => !i.seenAt)) s.markAllSeen();
  });

  const list = tab === "unread" ? s.items.filter((i) => !i.readAt) : s.items;

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className={cn(
          "relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent"
        )}
      >
        <Bell className="size-4" />
        <Badge count={s.badgeCount} className="absolute -right-1 -top-1" />
      </button>

      {open && (
        <div className="absolute left-full top-0 z-40 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-semibold">Notifications</div>
            <button
              onClick={s.markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
          </div>
          <div className="flex gap-4 border-b px-4 text-sm">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px border-b-2 py-2 capitalize",
                  tab === t
                    ? "border-primary font-medium"
                    : "border-transparent text-muted-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {list.length === 0 && <EmptyState />}
            {list.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  s.open(n);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent",
                  s.freshIds.has(n.id) && "bg-primary/10"
                )}
              >
                <div className="mt-0.5 text-muted-foreground">
                  {kindMeta[n.kind].icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm",
                      !n.readAt ? "font-medium" : "text-muted-foreground"
                    )}
                  >
                    {n.title}
                  </div>
                  {n.detail && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.detail}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {timeAgo(n.insertedAt)}
                  </div>
                </div>
                {!n.readAt && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variant B: sidebar item + slide-over drawer ─────────────────────────────

function VariantBNavSlot() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  // New arrivals while the drawer is open are held behind a pill so the list
  // doesn't jump under the cursor.
  const [shownIds, setShownIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (open) setShownIds(new Set(s.items.map((i) => i.id)));
    else setShownIds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pending = shownIds ? s.items.filter((i) => !shownIds.has(i.id)) : [];
  const list = shownIds ? s.items.filter((i) => shownIds.has(i.id)) : s.items;
  const today = list.filter(
    (i) => Date.now() - new Date(i.insertedAt).getTime() < 86_400_000
  );
  const earlier = list.filter((i) => !today.includes(i));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        Notifications
        <Badge count={s.badgeCount} className="ml-auto" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
          <div className="flex-1" onClick={() => setOpen(false)} />
          <aside className="flex h-full w-[28rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="text-lg font-semibold">Notifications</div>
              <div className="flex items-center gap-3">
                <button
                  onClick={s.markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Mark all as read
                </button>
                <button onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="relative flex-1 overflow-y-auto">
              {pending.length > 0 && (
                <button
                  onClick={() =>
                    setShownIds(new Set(s.items.map((i) => i.id)))
                  }
                  className="sticky top-2 z-10 mx-auto my-2 block rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow"
                >
                  ↑ {pending.length} new notification
                  {pending.length > 1 ? "s" : ""}
                </button>
              )}
              {list.length === 0 && <EmptyState />}
              {[
                ["Today", today],
                ["Earlier", earlier],
              ].map(([label, group]) =>
                (group as ProtoNotification[]).length === 0 ? null : (
                  <section key={label as string}>
                    <div className="bg-muted/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {label as string}
                    </div>
                    {(group as ProtoNotification[]).map((n) => (
                      <DrawerRow key={n.id} n={n} onOpen={() => setOpen(false)} />
                    ))}
                  </section>
                )
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function DrawerRow({ n, onOpen }: { n: ProtoNotification; onOpen: () => void }) {
  const s = useStore();
  return (
    <div className="group flex gap-3 border-b px-5 py-4 hover:bg-accent/50">
      <button
        title={n.readAt ? "Mark as unread" : "Mark as read"}
        onClick={() => (n.readAt ? s.markUnread(n.id) : s.markRead(n.id))}
        className="mt-0.5 text-primary"
      >
        {n.readAt ? (
          <Circle className="size-3 opacity-30" />
        ) : (
          <CircleDot className="size-3" />
        )}
      </button>
      <button
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          s.open(n);
          onOpen();
        }}
      >
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {kindMeta[n.kind].icon}
          {kindMeta[n.kind].group} · {timeAgo(n.insertedAt)}
        </div>
        <div className={cn("text-sm", !n.readAt && "font-semibold")}>
          {n.title}
        </div>
        {n.detail && (
          <div className="mt-1 rounded border-l-2 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
            {n.detail}
          </div>
        )}
      </button>
      <button
        title="Archive"
        onClick={() => s.archive(n.id)}
        className="self-start text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <Archive className="size-4" />
      </button>
    </div>
  );
}

// ─── Variant C: sidebar item + full inbox page ───────────────────────────────

function VariantCNavSlot() {
  const s = useStore();
  const [params, setParams] = useSearchParams();
  const active = params.get("inbox") === "1";
  return (
    <button
      onClick={() => {
        const p = new URLSearchParams(params);
        p.set("inbox", "1");
        setParams(p);
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Bell className="size-4" />
      Inbox
      <Badge count={s.badgeCount} className="ml-auto" />
    </button>
  );
}

function VariantCPage() {
  const s = useStore();
  const [filter, setFilter] = useState<
    "all" | "unread" | "Refunds" | "Discussions" | "Seats"
  >("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = {
    all: s.items.length,
    unread: s.items.filter((i) => !i.readAt).length,
    Refunds: s.items.filter((i) => kindMeta[i.kind].group === "Refunds").length,
    Discussions: s.items.filter((i) => kindMeta[i.kind].group === "Discussions")
      .length,
    Seats: s.items.filter((i) => kindMeta[i.kind].group === "Seats").length,
  };
  const list = s.items.filter((i) =>
    filter === "all"
      ? true
      : filter === "unread"
        ? !i.readAt
        : kindMeta[i.kind].group === filter
  );
  const toggle = (id: string) =>
    setSelected((sel) => {
      const c = new Set(sel);
      c.has(id) ? c.delete(id) : c.add(id);
      return c;
    });

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Inbox</h1>
      <div className="flex gap-8">
        <nav className="w-44 shrink-0 space-y-1 text-sm">
          {(Object.keys(counts) as (keyof typeof counts)[])
            .filter((k) => counts[k] > 0 || k === "all" || k === "unread")
            .map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-1.5 capitalize",
                  filter === k ? "bg-accent font-medium" : "hover:bg-accent/50"
                )}
              >
                {k}
                <span className="text-xs text-muted-foreground">{counts[k]}</span>
              </button>
            ))}
        </nav>
        <div className="flex-1 overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={list.length > 0 && list.every((i) => selected.has(i.id))}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? new Set(list.map((i) => i.id)) : new Set()
                )
              }
            />
            {selected.size > 0 ? (
              <>
                <span className="text-muted-foreground">{selected.size} selected</span>
                <button
                  className="hover:underline"
                  onClick={() => {
                    selected.forEach((id) => s.markRead(id));
                    setSelected(new Set());
                  }}
                >
                  Mark read
                </button>
                <button
                  className="hover:underline"
                  onClick={() => {
                    selected.forEach((id) => s.markUnread(id));
                    setSelected(new Set());
                  }}
                >
                  Mark unread
                </button>
                <button
                  className="hover:underline"
                  onClick={() => {
                    selected.forEach((id) => s.archive(id));
                    setSelected(new Set());
                  }}
                >
                  Archive
                </button>
              </>
            ) : (
              <button className="ml-auto hover:underline" onClick={s.markAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          {list.length === 0 && <EmptyState />}
          <table className="w-full text-sm">
            <tbody>
              {list.map((n) => (
                <tr
                  key={n.id}
                  className={cn(
                    "border-b transition-colors last:border-0 hover:bg-accent/40",
                    !n.readAt && "bg-primary/5",
                    s.freshIds.has(n.id) && "animate-pulse bg-primary/15"
                  )}
                >
                  <td className="w-8 px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggle(n.id)}
                    />
                  </td>
                  <td className="w-28 py-3 align-top text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {kindMeta[n.kind].icon}
                      {kindMeta[n.kind].group}
                    </span>
                  </td>
                  <td
                    className="cursor-pointer py-3 pr-4"
                    onClick={() => s.open(n)}
                  >
                    <div className={cn(!n.readAt && "font-semibold")}>
                      {n.title}
                    </div>
                    {n.detail && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {n.detail}
                      </div>
                    )}
                  </td>
                  <td className="w-20 whitespace-nowrap py-3 pr-4 text-right align-top text-xs text-muted-foreground">
                    {timeAgo(n.insertedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── switcher ────────────────────────────────────────────────────────────────

const VARIANTS = [
  { key: "A", name: "Bell + popover" },
  { key: "B", name: "Sidebar item + drawer" },
  { key: "C", name: "Full inbox page" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

function useVariant(): VariantKey {
  const [params] = useSearchParams();
  const v = params.get("variant");
  return (VARIANTS.find((x) => x.key === v)?.key ?? "A") as VariantKey;
}

function PrototypeSwitcher() {
  const s = useStore();
  const variant = useVariant();
  const [params, setParams] = useSearchParams();
  const idx = VARIANTS.findIndex((v) => v.key === variant);

  const go = (delta: number) => {
    const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
    const p = new URLSearchParams(params);
    p.set("variant", next.key);
    p.delete("inbox");
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-3 py-2 text-xs text-white shadow-2xl ring-1 ring-white/10">
      <span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-zinc-900">
        PROTOTYPE
      </span>
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-40 text-center font-medium">
        {variant} ({VARIANTS[idx].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronRight className="size-4" />
      </button>
      <span className="h-4 w-px bg-white/20" />
      <button
        onClick={s.simulateIncoming}
        disabled={s.remainingIncoming === 0}
        className="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-40"
      >
        Simulate arrival ({s.remainingIncoming})
      </button>
      <label className="flex items-center gap-1">
        Badge:
        <select
          value={s.badgeMode}
          onChange={(e) => s.setBadgeMode(e.target.value as BadgeMode)}
          className="rounded bg-white/10 px-1 py-0.5"
        >
          <option value="unseen">unseen</option>
          <option value="unread">unread</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={s.toastOnArrival}
          onChange={(e) => s.setToastOnArrival(e.target.checked)}
        />
        toast
      </label>
      <button onClick={s.reset} className="rounded-full px-2 py-1 hover:bg-white/10">
        Reset
      </button>
    </div>
  );
}

// ─── exports used by layout.app.tsx ──────────────────────────────────────────

export function NotificationFeedPrototype({
  initial,
  incoming,
  children,
}: {
  initial: ProtoNotification[];
  incoming: ProtoNotification[];
  children: React.ReactNode;
}) {
  return (
    <NotificationStoreProvider initial={initial} incoming={incoming}>
      {children}
      <PrototypeSwitcher />
    </NotificationStoreProvider>
  );
}

export function PrototypeHeaderSlot() {
  return useVariant() === "A" ? <VariantAHeaderSlot /> : null;
}

export function PrototypeNavSlot() {
  const v = useVariant();
  if (v === "B") return <VariantBNavSlot />;
  if (v === "C") return <VariantCNavSlot />;
  return null;
}

/** Variant C replaces the page content with the inbox when `?inbox=1`. */
export function usePrototypeInboxPage(): React.ReactNode | null {
  const v = useVariant();
  const [params] = useSearchParams();
  return v === "C" && params.get("inbox") === "1" ? <VariantCPage /> : null;
}
