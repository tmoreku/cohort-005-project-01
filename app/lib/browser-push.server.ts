import {
  toKnockRecipient,
  upsertKnockRecipient,
  type RecipientOptions,
  type RecipientUser,
} from "~/lib/notifier.server";

// ─── Browser push registration ───
// Each browser that turns push on gives Cadence an FCM token. The token goes
// on the person's Knock channel data for the `web-push-fcm` channel, which
// Knock's endpoint addresses by the channel's UUID (KNOCK_FCM_CHANNEL_ID),
// not its key. Knock's "Token deregistration" removes tokens FCM rejects, so
// Cadence has no cleanup of its own (docs/adr/0013).

const KNOCK_API_URL = "https://api.knock.app/v1";

// The workflow "Send a test notification" triggers: one push step, no
// preferences, not a Notification kind.
export const BROWSER_PUSH_TEST_WORKFLOW = "browser-push-test";

export type KnockPushConfig = {
  knockSecretApiKey: string;
  fcmChannelId: string;
} & RecipientOptions;

type Env = Record<string, string | undefined>;

// Null when Knock's secret key or the push channel's ID is missing: Cadence
// then runs without browser push.
export function knockPushConfig(
  env: Env = process.env
): KnockPushConfig | null {
  const knockSecretApiKey = env.KNOCK_SECRET_API_KEY;
  const fcmChannelId = env.KNOCK_FCM_CHANNEL_ID;
  if (!knockSecretApiKey || !fcmChannelId) return null;
  return {
    knockSecretApiKey,
    fcmChannelId,
    production: env.NODE_ENV === "production",
    devEmailTo: env.DEV_EMAIL_TO,
  };
}

// What the browser needs to get an FCM token: the Firebase web app's public
// config and our VAPID public key. Null unless Knock push is configured too,
// so the Browser notifications card only offers push when it can work.
export type BrowserPushConfig = {
  firebase: {
    apiKey: string;
    projectId: string;
    messagingSenderId: string;
    appId: string;
  };
  vapidPublicKey: string;
};

export function browserPushConfig(
  env: Env = process.env
): BrowserPushConfig | null {
  const apiKey = env.FIREBASE_API_KEY;
  const projectId = env.FIREBASE_PROJECT_ID;
  const messagingSenderId = env.FIREBASE_MESSAGING_SENDER_ID;
  const appId = env.FIREBASE_APP_ID;
  const vapidPublicKey = env.FIREBASE_VAPID_PUBLIC_KEY;
  if (
    !knockPushConfig(env) ||
    !apiKey ||
    !projectId ||
    !messagingSenderId ||
    !appId ||
    !vapidPublicKey
  ) {
    return null;
  }
  return {
    firebase: { apiKey, projectId, messagingSenderId, appId },
    vapidPublicKey,
  };
}

async function knockRequest(
  config: KnockPushConfig,
  path: string,
  init: { method: "GET" | "PUT" | "POST"; body?: unknown }
): Promise<Response> {
  return fetch(`${KNOCK_API_URL}${path}`, {
    method: init.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.knockSecretApiKey}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function channelDataPath(userId: number, config: KnockPushConfig) {
  return `/users/${encodeURIComponent(String(userId))}/channel_data/${encodeURIComponent(config.fcmChannelId)}`;
}

async function readTokens(
  userId: number,
  config: KnockPushConfig
): Promise<string[]> {
  const response = await knockRequest(config, channelDataPath(userId, config), {
    method: "GET",
  });
  // No channel data yet (or no such user): no tokens.
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Knock refused to read push tokens: ${response.status}`);
  }
  const body: unknown = await response.json();
  return tokensIn(body);
}

function tokensIn(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("data" in body)) return [];
  const data = body.data;
  if (typeof data !== "object" || data === null || !("tokens" in data)) {
    return [];
  }
  const tokens = data.tokens;
  return Array.isArray(tokens)
    ? tokens.filter((token): token is string => typeof token === "string")
    : [];
}

async function writeTokens(
  userId: number,
  tokens: string[],
  config: KnockPushConfig
): Promise<void> {
  const response = await knockRequest(config, channelDataPath(userId, config), {
    method: "PUT",
    body: { data: { tokens } },
  });
  if (!response.ok) {
    throw new Error(`Knock refused to save push tokens: ${response.status}`);
  }
}

// Upserts the person (Knock needs them to exist before channel data can be
// set), then adds this browser's token next to their other browsers'.
export async function registerPushToken(
  user: RecipientUser,
  token: string,
  config: KnockPushConfig
): Promise<void> {
  await upsertKnockRecipient(user, config);
  const tokens = await readTokens(user.id, config);
  if (tokens.includes(token)) return;
  await writeTokens(user.id, [...tokens, token], config);
}

export async function unregisterPushToken(
  userId: number,
  token: string,
  config: KnockPushConfig
): Promise<void> {
  const tokens = await readTokens(userId, config);
  if (!tokens.includes(token)) return;
  await writeTokens(
    userId,
    tokens.filter((t) => t !== token),
    config
  );
}

export async function isPushTokenRegistered(
  userId: number,
  token: string,
  config: KnockPushConfig
): Promise<boolean> {
  return (await readTokens(userId, config)).includes(token);
}

// Sends a push to every browser the person has turned on. Clicking it opens
// the Browser notifications card.
export async function sendTestPush(
  user: RecipientUser,
  config: KnockPushConfig
): Promise<void> {
  const response = await knockRequest(
    config,
    `/workflows/${BROWSER_PUSH_TEST_WORKFLOW}/trigger`,
    {
      method: "POST",
      body: {
        recipients: [toKnockRecipient(user, config)],
        data: { url: "/settings#browser-notifications" },
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Knock refused the test push: ${response.status}`);
  }
}
