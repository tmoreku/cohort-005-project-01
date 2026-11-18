import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Cadence's service worker is plain JavaScript in public/service-worker.js. These
// tests run it against a stand-in for the service worker global scope and
// fire the events the browser would.

type Listener = (event: FakeEvent) => void;
type FakeEvent = {
  data?: { json: () => unknown; text: () => string } | null;
  notification?: FakeNotification;
  waitUntil: (promise: Promise<unknown>) => void;
};
type FakeNotification = {
  title: string;
  data: { url: string };
  close: () => void;
};
type FakeWindow = {
  url: string;
  focus: () => Promise<FakeWindow>;
  navigate: (url: string) => Promise<FakeWindow>;
};

function loadServiceWorker(windows: FakeWindow[] = []) {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: "http://localhost:5173" },
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    registration: {
      showNotification: async (
        title: string,
        options: Record<string, unknown>
      ) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url);
        return null;
      },
    },
  };
  runInNewContext(
    readFileSync(
      new URL("../public/service-worker.js", import.meta.url),
      "utf8"
    ),
    { self, URL }
  );

  async function fire(type: string, event: Omit<FakeEvent, "waitUntil">) {
    const pending: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    if (!listener) throw new Error(`No ${type} listener`);
    listener({ ...event, waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  }

  return { fire, shown, opened };
}

const pushData = (payload: unknown) => ({
  json: () => payload,
  text: () => JSON.stringify(payload),
});

// What FCM delivers for a Knock push step: Knock's title and body as
// `notification`, the trigger data (flattened, as strings) as `data`.
const fcmMessage = {
  notification: {
    title: "Linus replied to your question on Closures, explained.",
    body: "The inner function closes over it.",
  },
  data: {
    url: "/courses/js/lessons/7#discussion-reply-12",
    workflow: "discussion-reply",
    "actor.name": "Linus",
  },
  from: "1234",
  fcmMessageId: "abc",
};

describe("push", () => {
  it("shows the notification FCM delivered, carrying its url", async () => {
    const sw = loadServiceWorker();

    await sw.fire("push", { data: pushData(fcmMessage) });

    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe(
      "Linus replied to your question on Closures, explained."
    );
    expect(sw.shown[0].options).toMatchObject({
      body: "The inner function closes over it.",
      data: { url: "/courses/js/lessons/7#discussion-reply-12" },
    });
  });

  it("still shows a notification when the push has no usable payload", async () => {
    const sw = loadServiceWorker();

    await sw.fire("push", { data: null });

    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("Cadence");
    expect(sw.shown[0].options).toMatchObject({ data: { url: "/" } });
  });
});

describe("notificationclick", () => {
  const notification = (url: string): FakeNotification => ({
    title: "x",
    data: { url },
    close: () => {},
  });

  it("opens the notification's url in a new window when Cadence isn't open", async () => {
    const sw = loadServiceWorker();

    await sw.fire("notificationclick", {
      notification: notification("/team?course=3#seat-9"),
    });

    expect(sw.opened).toEqual(["/team?course=3#seat-9"]);
  });

  it("navigates an open Cadence window to the url instead", async () => {
    const navigated: string[] = [];
    const win: FakeWindow = {
      url: "http://localhost:5173/dashboard",
      focus: async () => win,
      navigate: async (url) => {
        navigated.push(url);
        return win;
      },
    };
    const sw = loadServiceWorker([win]);

    await sw.fire("notificationclick", {
      notification: notification("/admin/refunds?request=4"),
    });

    expect(navigated).toEqual(["/admin/refunds?request=4"]);
    expect(sw.opened).toEqual([]);
  });
});
