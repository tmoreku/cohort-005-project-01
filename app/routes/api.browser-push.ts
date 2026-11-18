import { data } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/api.browser-push";
import { db } from "~/db";
import { users } from "~/db/schema";
import {
  isPushTokenRegistered,
  knockPushConfig,
  registerPushToken,
  sendTestPush,
  unregisterPushToken,
} from "~/lib/browser-push.server";
import { getCurrentUserId } from "~/lib/session";
import { parseJsonBody } from "~/lib/validation";

// The Browser notifications card's calls to Knock, as the signed-in person:
// register or remove this browser's FCM token, check it's still registered,
// and send a test push. The secret key stays on the server.

const token = z.string().min(1).max(4096);

const browserPushSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("register"), token }),
  z.object({ intent: z.literal("unregister"), token }),
  z.object({ intent: z.literal("check"), token }),
  z.object({ intent: z.literal("test") }),
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel", { status: 401 });
  }
  const user = db.select().from(users).where(eq(users.id, currentUserId)).get();
  if (!user) {
    throw data("User not found", { status: 404 });
  }
  const config = knockPushConfig();
  if (!config) {
    throw data("Browser push is not configured", { status: 404 });
  }

  const parsed = await parseJsonBody(request, browserPushSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }
  const body = parsed.data;

  try {
    switch (body.intent) {
      case "register":
        await registerPushToken(user, body.token, config);
        return { registered: true };
      case "unregister":
        await unregisterPushToken(user.id, body.token, config);
        return { registered: false };
      case "check":
        return {
          registered: await isPushTokenRegistered(user.id, body.token, config),
        };
      case "test":
        await sendTestPush(user, config);
        return { sent: true };
    }
  } catch (error) {
    console.error(`Browser push ${body.intent} failed:`, error);
    throw data("Knock couldn't be reached", { status: 502 });
  }
}
