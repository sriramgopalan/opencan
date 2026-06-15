import { PrismaAdapter } from "@auth/prisma-adapter";
import { hash, verify } from "@node-rs/argon2";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { sendWelcomeEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";
import {
  getProviderForEmail,
  getUserWithPasswordHash,
  incrementFailedLoginCount,
  lockAccount,
  resetFailedLoginCount,
} from "@/server/repositories/user";

const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 15,
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await getUserWithPasswordHash(email);
        if (!user?.passwordHash) return null;

        // Check lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        const valid = await verify(user.passwordHash, password);
        if (!valid) {
          const newCount = await incrementFailedLoginCount(user.id);
          if (newCount >= MAX_FAILED_LOGINS) {
            const until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
            await lockAccount(user.id, until);
            logger.info({ ip: "credentials-flow" }, "account locked");
          }
          return null;
        }

        await resetFailedLoginCount(user.id);
        return { id: user.id, email, role: user.role };
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: "email profile" } },
    }),
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "user:email" } },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    signIn: async ({ user, account }) => {
      if (!account || account.type === "credentials") return true;

      const email = user.email;
      if (!email) {
        return "/auth/error?error=NoEmail";
      }

      // Check for account conflict: email exists under a different provider
      const existingProvider = await getProviderForEmail(email);
      if (existingProvider && existingProvider !== account.provider) {
        const providerLabel =
          existingProvider === "credentials" ? "email/password" : existingProvider;
        return `/auth/error?error=OAuthAccountNotLinked&provider=${encodeURIComponent(providerLabel)}`;
      }

      return true;
    },
  },
  events: {
    // M3: fire welcome email on first sign-in (isNewUser covers OAuth account creation).
    // Credentials registrations create the user record before the first sign-in, so
    // isNewUser is false there — welcome is intentionally withheld until email is verified.
    signIn: async ({ user, isNewUser }) => {
      if (!isNewUser || !user.email) return;
      sendWelcomeEmail(user.email).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "welcome email failed");
      });
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});

export { hash as hashPassword };
