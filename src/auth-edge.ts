import { jwtDecrypt } from "jose";

async function getDerivedKey(secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(""),
      info: encoder.encode("Auth.js Generated Encryption Key"),
    },
    keyMaterial,
    512,
  );
  return new Uint8Array(bits);
}

export async function getSessionFromJWT(
  token: string,
): Promise<{ id: string; role: string; email: string } | null> {
  try {
    const derivedKey = await getDerivedKey(process.env["AUTH_SECRET"] ?? "");
    const { payload } = await jwtDecrypt(token, derivedKey);
    console.log("[auth-edge] JWT payload:", JSON.stringify(payload));
    return {
      id: (payload.sub ?? payload.id ?? "") as string,
      role: (payload.role as string) ?? "MEMBER",
      email: (payload.email as string) ?? "",
    };
  } catch (err) {
    console.error("[auth-edge] jwtDecrypt failed:", err);
    return null;
  }
}
