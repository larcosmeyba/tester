import assert from "node:assert/strict";
import test from "node:test";

import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from "jose";

import { generateAppleClientSecret } from "./apple.js";

test("Apple client secret has the required issuer, audience, subject, and key id", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const encodedPrivateKey = await exportPKCS8(privateKey);
  const clientSecret = await generateAppleClientSecret(
    "com.example.helpthehive.signin",
    "APPLETEAM1",
    "APPLEKEY1",
    encodedPrivateKey.replace(/\n/g, "\\n"),
  );

  const { payload } = await jwtVerify(clientSecret, publicKey, {
    algorithms: ["ES256"],
    audience: "https://appleid.apple.com",
    issuer: "APPLETEAM1",
    subject: "com.example.helpthehive.signin",
  });
  const header = decodeProtectedHeader(clientSecret);

  assert.equal(header.kid, "APPLEKEY1");
  assert.equal(header.alg, "ES256");
  assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 180 * 24 * 60 * 60);
});
