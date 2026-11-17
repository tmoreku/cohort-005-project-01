import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.user-locale";
import { db } from "~/db";
import { getCurrentUserId } from "~/lib/session";
import { recordBrowserTimezoneAndLocale } from "~/lib/user-locale.server";
import { parseJsonBody } from "~/lib/validation";

const userLocaleSchema = z.object({
  timezone: z.string().min(1).max(100),
  locale: z.string().min(1).max(100),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, userLocaleSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const written = recordBrowserTimezoneAndLocale(
    db,
    currentUserId,
    parsed.data
  );

  return { written };
}
