import { importPKCS8, SignJWT } from "jose";

// ─── Knock user token ───
// The Notification Feed connects to Knock from the browser with the public
// API key plus a user token, so one person can't read another's Feed
// (Knock's "Enhanced security mode"). The token is an RS256 JWT signed with
// KNOCK_SIGNING_KEY, valid for an hour, and renewed through
// /api/knock-token before it expires.

const TOKEN_LIFETIME_SECONDS = 60 * 60;

// Knock's dashboard hands the signing key out as a PEM, and offers it
// base64-encoded for environment variables. Accept either, and a PEM whose
// newlines were written as "\n" on one line.
function toPem(signingKey: string): string {
  const trimmed = signingKey.trim();
  if (trimmed.startsWith("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
  return Buffer.from(trimmed, "base64").toString("utf8");
}

export async function signKnockUserToken(
  userId: number,
  signingKey: string,
  now: Date = new Date()
): Promise<string> {
  const key = await importPKCS8(toPem(signingKey), "RS256");
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_LIFETIME_SECONDS)
    .sign(key);
}

// What the browser needs to show the Feed. Null when Knock isn't configured
// (fresh checkouts, tests), so Cadence runs with no Feed rather than failing.
export type KnockFeedConfig = {
  publicApiKey: string;
  feedChannelId: string;
  userToken: string;
};

export async function getKnockFeedConfig(
  userId: number
): Promise<KnockFeedConfig | null> {
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  const auth = await getKnockUserAuth(userId);
  if (!auth || !feedChannelId) return null;

  return { ...auth, feedChannelId };
}

// What the browser needs to call Knock as this user (Notification
// Preferences). Null when Knock isn't configured.
export type KnockUserAuth = {
  publicApiKey: string;
  userToken: string;
};

export async function getKnockUserAuth(
  userId: number
): Promise<KnockUserAuth | null> {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  if (!publicApiKey) return null;
  const userToken = await renewKnockUserToken(userId);
  if (!userToken) return null;

  return { publicApiKey, userToken };
}

// A fresh token for the signed-in user, or null when there's no signing key.
export async function renewKnockUserToken(
  userId: number
): Promise<string | null> {
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!signingKey) return null;
  return signKnockUserToken(userId, signingKey);
}
