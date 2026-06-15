import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env["AUTH_SECRET"] ?? "");

export async function getSessionFromJWT(
  token: string,
): Promise<{ id: string; role: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return {
      id: payload.sub ?? (payload.id as string),
      role: (payload.role as string) ?? "MEMBER",
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}
