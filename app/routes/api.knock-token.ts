import { data } from "react-router";
import type { Route } from "./+types/api.knock-token";
import { getCurrentUserId } from "~/lib/session";
import { renewKnockUserToken } from "~/lib/knock-token.server";

// Renews the Knock user token. The Feed's KnockProvider calls this from its
// token-expiring callback, so the Feed stays connected without a reload.
export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const token = await renewKnockUserToken(currentUserId);
  if (!token) {
    throw data("Knock is not configured", { status: 404 });
  }

  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
