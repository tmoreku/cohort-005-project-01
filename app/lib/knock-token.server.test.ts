import { generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { signKnockUserToken } from "./knock-token.server";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

async function verify(token: string) {
  const key = await importSPKI(publicKey, "RS256");
  return jwtVerify(token, key, {
    currentDate: new Date("2026-11-17T10:30:00Z"),
  });
}

describe("signKnockUserToken", () => {
  const now = new Date("2026-11-17T10:00:00Z");

  it("signs an RS256 token for the user, expiring an hour later", async () => {
    const token = await signKnockUserToken(42, privateKey, now);

    expect(decodeProtectedHeader(token).alg).toBe("RS256");
    const { payload } = await verify(token);
    expect(payload.sub).toBe("42");
    expect(payload.iat).toBe(1_794_909_600);
    expect(payload.exp).toBe(1_794_913_200);
  });

  it("accepts the signing key base64-encoded, as Knock's dashboard offers it", async () => {
    const encoded = Buffer.from(privateKey).toString("base64");

    const token = await signKnockUserToken(7, encoded, now);

    const { payload } = await verify(token);
    expect(payload.sub).toBe("7");
  });

  it("accepts a key whose newlines were escaped in .env", async () => {
    const escaped = privateKey.replace(/\n/g, "\\n");

    const token = await signKnockUserToken(7, escaped, now);

    const { payload } = await verify(token);
    expect(payload.sub).toBe("7");
  });
});
