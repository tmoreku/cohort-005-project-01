// PROTOTYPE (throwaway): browser push permission — wayfinder ticket #16.
// Registers / removes this browser's FCM token on the current user's Knock
// channel data and triggers a test push. Talks to Knock's REST API directly.
import { data } from "react-router";
import type { Route } from "./+types/api.prototype-push";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";

try {
  process.loadEnvFile?.(".env");
} catch {}

const KNOCK = "https://api.knock.app/v1";
// Knock's channel_data endpoint needs the channel UUID, not the key.
const channel = () => {
  const id = process.env.KNOCK_FCM_CHANNEL_ID;
  if (!id) throw new Error("Set KNOCK_FCM_CHANNEL_ID in .env (Knock → Integrations → Channels → web-push-fcm → Channel ID)");
  return id;
};

async function knock(path: string, init?: RequestInit) {
  const res = await fetch(`${KNOCK}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.KNOCK_SECRET_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok && res.status !== 404) {
    throw new Error(`Knock ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  return { status: res.status, body };
}

async function getTokens(userId: string): Promise<string[]> {
  const { status, body } = await knock(
    `/users/${userId}/channel_data/${channel()}`
  );
  return status === 404 ? [] : (body?.data?.tokens ?? []);
}

async function setTokens(userId: string, tokens: string[]) {
  await knock(`/users/${userId}/channel_data/${channel()}`, {
    method: "PUT",
    body: JSON.stringify({ data: { tokens } }),
  });
}

async function requireUser(request: Request) {
  const id = await getCurrentUserId(request);
  if (!id) throw data({ error: "Select a user from the DevUI panel" }, { status: 401 });
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw data({ error: "Unknown user" }, { status: 401 });
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { userId: String(user.id), tokens: await getTokens(String(user.id)) };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const userId = String(user.id);
  const form = await request.formData();
  const intent = form.get("intent");
  const token = String(form.get("token") ?? "");

  try {
    if (intent === "register") {
      // Knock requires the user to exist before channel data can be set.
      await knock(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ name: user.name, email: user.email }),
      });
      const tokens = await getTokens(userId);
      if (!tokens.includes(token)) await setTokens(userId, [...tokens, token]);
      return { ok: true, tokens: await getTokens(userId) };
    }
    if (intent === "unregister") {
      const tokens = await getTokens(userId);
      await setTokens(userId, tokens.filter((t) => t !== token));
      return { ok: true, tokens: await getTokens(userId) };
    }
    if (intent === "test") {
      const { body } = await knock(`/workflows/prototype-push-test/trigger`, {
        method: "POST",
        body: JSON.stringify({
          recipients: [{ id: userId, name: user.name, email: user.email }],
          data: {
            title: "Test from Cadence",
            body: `Hi ${user.name}, browser notifications work.`,
            url: "/settings",
          },
        }),
      });
      return { ok: true, workflowRunId: body?.workflow_run_id ?? null, raw: body };
    }
    return data({ error: `Unknown intent ${intent}` }, { status: 400 });
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 502 });
  }
}
