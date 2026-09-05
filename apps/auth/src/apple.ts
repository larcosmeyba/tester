import { importPKCS8, SignJWT } from "jose";

const appleAudience = "https://appleid.apple.com";
const appleClientSecretLifetimeSeconds = 180 * 24 * 60 * 60;

export async function generateAppleClientSecret(
  clientId: string,
  teamId: string,
  keyId: string,
  privateKey: string,
) {
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(appleAudience)
    .setIssuedAt(now)
    .setExpirationTime(now + appleClientSecretLifetimeSeconds)
    .sign(key);
}
