import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCurrentUserId } from "~/lib/session";
import { action as switchUser } from "./api.switch-user";
import { action as logout } from "./api.logout";

// Spec #21 / #31: browser push follows the signed-in person on a shared
// browser. The logout and DevUI switch forms post this browser's FCM token
// along, and the action removes it from the outgoing person's Knock channel
// data before the session changes.

// Knock's channel data endpoint for the push channel, per user.
function fakeKnock() {
  const tokens = new Map<string, string[]>();
  let failing = false;
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    if (failing) return new Response("{}", { status: 500 });
    const url = new URL(String(input));
    const match = url.pathname.match(
      /^\/v1\/users\/([^/]+)\/channel_data\/fcm-channel$/
    );
    if (!match) return new Response("not found", { status: 404 });
    const userId = decodeURIComponent(match[1]);
    if ((init?.method ?? "GET") === "GET") {
      const current = tokens.get(userId);
      return current
        ? Response.json({ data: { tokens: current } })
        : Response.json({ code: "resource_missing" }, { status: 404 });
    }
    const body = JSON.parse(String(init?.body));
    tokens.set(userId, body.data.tokens);
    return Response.json(body);
  };
  return {
    fetchImpl,
    tokens,
    fail: () => {
      failing = true;
    },
  };
}

let knock: ReturnType<typeof fakeKnock>;

beforeEach(() => {
  knock = fakeKnock();
  vi.stubGlobal("fetch", knock.fetchImpl);
  vi.stubEnv("KNOCK_SECRET_API_KEY", "sk_test");
  vi.stubEnv("KNOCK_FCM_CHANNEL_ID", "fcm-channel");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function cookieFor(userId: number): Promise<string> {
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  return setCookie.split(";")[0];
}

async function post(
  path: string,
  fields: Record<string, string>,
  userId: number | null
) {
  const url = new URL(`http://localhost${path}`);
  const headers = new Headers();
  if (userId !== null) headers.set("Cookie", await cookieFor(userId));
  const request = new Request(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
  return { request, url, params: {}, context: {} };
}

async function switchTo(
  userId: number,
  from: number | null,
  pushToken?: string
) {
  const fields: Record<string, string> = { userId: String(userId) };
  if (pushToken !== undefined) fields.pushToken = pushToken;
  // @ts-expect-error -- only the args the action reads
  return switchUser(await post("/api/switch-user?redirectTo=/", fields, from));
}

async function logOut(from: number | null, pushToken?: string) {
  const fields: Record<string, string> = {};
  if (pushToken !== undefined) fields.pushToken = pushToken;
  // @ts-expect-error -- only the args the action reads
  return logout(await post("/api/logout", fields, from));
}

describe("DevUI user switch", () => {
  it("removes this browser's token from the outgoing person only", async () => {
    knock.tokens.set("1", ["this-browser", "their-phone"]);
    knock.tokens.set("2", ["someone-elses"]);

    const response = await switchTo(2, 1, "this-browser");

    expect(knock.tokens.get("1")).toEqual(["their-phone"]);
    expect(knock.tokens.get("2")).toEqual(["someone-elses"]);
    expect(response.status).toBe(302);
  });

  it("leaves the token alone when switching to the same person", async () => {
    knock.tokens.set("1", ["this-browser"]);

    await switchTo(1, 1, "this-browser");

    expect(knock.tokens.get("1")).toEqual(["this-browser"]);
  });

  it("still switches when this browser has no token or nobody was signed in", async () => {
    expect((await switchTo(2, 1)).status).toBe(302);
    expect((await switchTo(2, 1, "")).status).toBe(302);
    expect((await switchTo(2, null, "this-browser")).status).toBe(302);
  });

  it("still switches when Knock can't be reached", async () => {
    knock.fail();
    expect((await switchTo(2, 1, "this-browser")).status).toBe(302);
  });

  it("still switches when browser push isn't configured", async () => {
    vi.stubEnv("KNOCK_FCM_CHANNEL_ID", "");
    knock.tokens.set("1", ["this-browser"]);

    expect((await switchTo(2, 1, "this-browser")).status).toBe(302);
    expect(knock.tokens.get("1")).toEqual(["this-browser"]);
  });
});

describe("Logout", () => {
  it("removes this browser's token from the person signing out", async () => {
    knock.tokens.set("1", ["this-browser", "their-phone"]);

    const response = await logOut(1, "this-browser");

    expect(knock.tokens.get("1")).toEqual(["their-phone"]);
    expect(response.status).toBe(302);
  });

  it("still signs out when Knock can't be reached", async () => {
    knock.fail();
    expect((await logOut(1, "this-browser")).status).toBe(302);
  });
});
