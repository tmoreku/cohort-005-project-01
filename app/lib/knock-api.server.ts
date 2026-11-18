import type { RecipientOptions } from "~/lib/notifier.server";

// ─── Knock's REST API ───
// The server calls Knock's API (api.knock.app) with fetch and the secret API
// key rather than pulling in the Knock SDK. Every server-side Knock call goes
// through here, and reads its settings from the environment through here.

const KNOCK_API_URL = "https://api.knock.app/v1";

type Env = Record<string, string | undefined>;

export type KnockServerEnv = {
  // Unset in fresh checkouts and tests: Cadence then runs without Knock.
  knockSecretApiKey: string | undefined;
} & RecipientOptions;

export function knockServerEnv(env: Env = process.env): KnockServerEnv {
  return {
    knockSecretApiKey: env.KNOCK_SECRET_API_KEY,
    production: env.NODE_ENV === "production",
    devEmailTo: env.DEV_EMAIL_TO,
  };
}

export function knockApi(
  secretApiKey: string,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${KNOCK_API_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretApiKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
