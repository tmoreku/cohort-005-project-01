import { redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.logout";
import { releasePushToken } from "~/lib/browser-push.server";
import { destroySession, getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";

const logoutSchema = z.object({
  // This browser's FCM token, when push is on here (BrowserPushTokenField).
  pushToken: z.string().max(4096).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  // Signing out never fails over push: a bad token field is just ignored.
  const parsed = parseFormData(await request.formData(), logoutSchema);
  if (parsed.success) {
    await releasePushToken(
      await getCurrentUserId(request),
      parsed.data.pushToken
    );
  }

  const cookie = await destroySession(request);

  return redirect("/", {
    headers: { "Set-Cookie": cookie },
  });
}
