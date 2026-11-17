import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.switch-user";
import { releasePushToken } from "~/lib/browser-push.server";
import { getCurrentUserId, setCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";

const switchUserSchema = z.object({
  userId: z.coerce.number().int().positive("Invalid user ID"),
  // This browser's FCM token, when push is on here (BrowserPushTokenField).
  pushToken: z.string().max(4096).optional(),
});

export async function action({ request, url }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = parseFormData(formData, switchUserSchema);

  if (!parsed.success) {
    throw new Response("Invalid user ID", { status: 400 });
  }

  const { userId, pushToken } = parsed.data;
  const outgoingUserId = await getCurrentUserId(request);
  if (outgoingUserId !== userId) {
    // The incoming person's BrowserPushProvider registers the token again if
    // push is allowed and not turned off in this browser.
    await releasePushToken(outgoingUserId, pushToken);
  }

  const cookie = await setCurrentUserId(request, userId);

  return redirect(url.searchParams.get("redirectTo") ?? "/", {
    headers: { "Set-Cookie": cookie },
  });
}
