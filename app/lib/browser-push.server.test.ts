import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserPushConfig,
  isPushTokenRegistered,
  knockPushConfig,
  registerPushToken,
  sendTestPush,
  unregisterPushToken,
  type KnockPushConfig,
} from "./browser-push.server";
import type { RecipientUser } from "./notifier.server";

// A stand-in for the parts of Knock's REST API that push registration uses:
// users, channel data and workflow triggers.
function fakeKnock() {
  const users = new Map<string, Record<string, unknown>>();
  const channelData = new Map<string, unknown>();
  const triggers: { workflow: string; body: unknown }[] = [];
  let failNext = false;

  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (failNext) {
      failNext = false;
      return new Response("{}", { status: 500 });
    }

    const user = url.pathname.match(/^\/v1\/users\/([^/]+)$/);
    if (user && method === "PUT") {
      users.set(decodeURIComponent(user[1]), body);
      return Response.json({ id: user[1], ...body });
    }

    const channel = url.pathname.match(
      /^\/v1\/users\/([^/]+)\/channel_data\/([^/]+)$/
    );
    if (channel) {
      const key = `${decodeURIComponent(channel[1])}/${channel[2]}`;
      if (method === "GET") {
        return channelData.has(key)
          ? Response.json({ data: channelData.get(key) })
          : Response.json({ code: "resource_missing" }, { status: 404 });
      }
      if (method === "PUT") {
        if (!users.has(decodeURIComponent(channel[1]))) {
          return Response.json({ code: "resource_missing" }, { status: 404 });
        }
        channelData.set(key, body.data);
        return Response.json({ data: body.data });
      }
    }

    const trigger = url.pathname.match(/^\/v1\/workflows\/([^/]+)\/trigger$/);
    if (trigger && method === "POST") {
      triggers.push({ workflow: trigger[1], body });
      return Response.json({ workflow_run_id: "run-1" });
    }

    return new Response("not found", { status: 404 });
  };

  return {
    fetchImpl,
    users,
    tokensOf: (userId: string) =>
      (channelData.get(`${userId}/fcm-channel`) as { tokens: string[] })
        ?.tokens,
    setTokens: (userId: string, tokens: string[]) =>
      channelData.set(`${userId}/fcm-channel`, { tokens }),
    triggers,
    failNext: () => {
      failNext = true;
    },
  };
}

const config: KnockPushConfig = {
  knockSecretApiKey: "sk_test",
  fcmChannelId: "fcm-channel",
  production: false,
};

const emma: RecipientUser = {
  id: 42,
  name: "Emma Wilson",
  email: "emma.wilson@student.dev",
  timezone: "Europe/London",
  locale: null,
};

let knock: ReturnType<typeof fakeKnock>;

beforeEach(() => {
  knock = fakeKnock();
  vi.stubGlobal("fetch", knock.fetchImpl);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerPushToken", () => {
  it("upserts the person in Knock, then adds this browser's token", async () => {
    await registerPushToken(emma, "token-a", config);

    expect(knock.users.get("42")).toEqual({
      name: "Emma Wilson",
      timezone: "Europe/London",
    });
    expect(knock.tokensOf("42")).toEqual(["token-a"]);
  });

  it("keeps the person's other browsers and doesn't add a token twice", async () => {
    knock.setTokens("42", ["token-b"]);

    await registerPushToken(emma, "token-a", config);
    await registerPushToken(emma, "token-a", config);

    expect(knock.tokensOf("42")).toEqual(["token-b", "token-a"]);
  });

  it("throws when Knock refuses", async () => {
    knock.failNext();
    await expect(registerPushToken(emma, "token-a", config)).rejects.toThrow();
  });
});

describe("unregisterPushToken", () => {
  it("removes only this browser's token", async () => {
    knock.users.set("42", {});
    knock.setTokens("42", ["token-a", "token-b"]);

    await unregisterPushToken(42, "token-a", config);

    expect(knock.tokensOf("42")).toEqual(["token-b"]);
  });

  it("does nothing when the person has no tokens", async () => {
    await unregisterPushToken(42, "token-a", config);
    expect(knock.tokensOf("42")).toBeUndefined();
  });
});

describe("isPushTokenRegistered", () => {
  it("says whether this browser's token is on the person's channel data", async () => {
    expect(await isPushTokenRegistered(42, "token-a", config)).toBe(false);
    knock.setTokens("42", ["token-a"]);
    expect(await isPushTokenRegistered(42, "token-a", config)).toBe(true);
  });
});

describe("sendTestPush", () => {
  it("triggers the browser push test workflow for the person, opening Browser notifications", async () => {
    await sendTestPush(emma, config);

    expect(knock.triggers).toEqual([
      {
        workflow: "browser-push-test",
        body: {
          recipients: [
            { id: "42", name: "Emma Wilson", timezone: "Europe/London" },
          ],
          data: { url: "/settings#browser-notifications" },
        },
      },
    ]);
  });
});

describe("browserPushConfig", () => {
  const firebase = {
    FIREBASE_API_KEY: "api",
    FIREBASE_PROJECT_ID: "cadence-dev",
    FIREBASE_MESSAGING_SENDER_ID: "123",
    FIREBASE_APP_ID: "app",
    FIREBASE_VAPID_PUBLIC_KEY: "vapid",
  };

  it("is null with no keys, so Cadence runs without browser push", () => {
    expect(browserPushConfig({})).toBeNull();
  });

  it("is null when Firebase is set up but Knock push isn't", () => {
    expect(browserPushConfig(firebase)).toBeNull();
  });

  it("gives the browser Firebase's public config and the VAPID public key", () => {
    expect(
      browserPushConfig({
        ...firebase,
        KNOCK_SECRET_API_KEY: "sk",
        KNOCK_FCM_CHANNEL_ID: "fcm",
      })
    ).toEqual({
      firebase: {
        apiKey: "api",
        projectId: "cadence-dev",
        messagingSenderId: "123",
        appId: "app",
      },
      vapidPublicKey: "vapid",
    });
  });
});

describe("knockPushConfig", () => {
  it("is null unless both the Knock secret key and the push channel ID are set", () => {
    expect(knockPushConfig({ KNOCK_SECRET_API_KEY: "sk" })).toBeNull();
    expect(knockPushConfig({ KNOCK_FCM_CHANNEL_ID: "fcm" })).toBeNull();
    expect(
      knockPushConfig({
        KNOCK_SECRET_API_KEY: "sk",
        KNOCK_FCM_CHANNEL_ID: "fcm",
        NODE_ENV: "production",
      })
    ).toEqual({
      knockSecretApiKey: "sk",
      fcmChannelId: "fcm",
      production: true,
      devEmailTo: undefined,
    });
  });
});
