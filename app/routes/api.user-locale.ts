import { data } from "react-router";
import type { Route } from "./+types/api.user-locale";
import { db } from "~/db";
import { getCurrentUserId } from "~/lib/session";
import { timezoneAndLocaleSchema } from "~/lib/timezone-and-locale";
import { recordBrowserTimezoneAndLocale } from "~/lib/user-locale.server";
import { parseJsonBody } from "~/lib/validation";

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, timezoneAndLocaleSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  recordBrowserTimezoneAndLocale(db, currentUserId, parsed.data);

  return new Response(null, { status: 204 });
}
