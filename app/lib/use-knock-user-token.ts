import { useCallback, useState } from "react";
import { z } from "zod";

// How long before the Knock user token expires its KnockProvider renews it.
export const RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

const tokenResponseSchema = z.object({ token: z.string() });

/**
 * The Knock user token for a KnockProvider, plus the `onUserTokenExpiring`
 * callback that renews it through /api/knock-token.
 *
 * Loaders sign a fresh token on every navigation. Keeping the first one (and
 * then only renewed ones) stops each navigation re-authenticating.
 */
export function useKnockUserToken(initialToken: string) {
  const [userToken, setUserToken] = useState(initialToken);

  const renewToken = useCallback(async () => {
    const response = await fetch("/api/knock-token", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) return;
    setUserToken(parsed.data.token);
    return parsed.data.token;
  }, []);

  return { userToken, renewToken };
}
