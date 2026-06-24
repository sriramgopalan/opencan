import { hkdf } from "@panva/hkdf";
import { jwtDecrypt } from "jose";

import { AUTH_COOKIE_NAME } from "@/lib/constants";

async function getDerivedEncryptionKey(secret: string): Promise<Uint8Array> {
  return hkdf(
    "sha256",
    secret,
    AUTH_COOKIE_NAME,
    `Auth.js Generated Encryption Key (${AUTH_COOKIE_NAME})`,
    64,
  );
}

export async function getSessionFromJWT(
  token: string,
): Promise<{ id: string; role: string; email: string } | null> {
  try {
    const encryptionKey = await getDerivedEncryptionKey(
      process.env["AUTH_SECRET"] ?? "",
    );
    const { payload } = await jwtDecrypt(token, encryptionKey, {
      clockTolerance: 15,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256CBC-HS512", "A256GCM"],
    });
    return {
      id: (payload.sub ?? payload.id ?? "") as string,
      role: (payload.role as string) ?? "MEMBER",
      email: (payload.email as string) ?? "",
    };
  } catch {
    return null;
  }
}
