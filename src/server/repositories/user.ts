import { createId } from "@paralleldrive/cuid2";

import { prisma } from "@/server/db";
import type { CreateUserInput, SafeUser } from "@/types/auth";

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  image: true,
  createdAt: true,
} as const;

export async function getUserById(id: string): Promise<SafeUser | null> {
  return prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
}

export async function getUserByEmail(email: string): Promise<SafeUser | null> {
  return prisma.user.findUnique({
    where: { email },
    select: SAFE_USER_SELECT,
  });
}

export async function getUserWithPasswordHash(
  email: string,
): Promise<{ id: string; passwordHash: string | null; failedLoginCount: number; lockedUntil: Date | null; role: string } | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
      role: true,
    },
  });
}

export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      image: input.image,
      emailVerified: input.emailVerified,
    },
    select: SAFE_USER_SELECT,
  });
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });
}

export async function incrementFailedLoginCount(userId: string): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  return updated.failedLoginCount;
}

export async function lockAccount(userId: string, until: Date): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil: until },
  });
}

export async function resetFailedLoginCount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function anonymiseUser(userId: string): Promise<void> {
  const anonId = createId();
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: `deleted-${anonId}@deleted.etash.com`,
      name: null,
      image: null,
      passwordHash: null,
      emailVerified: null,
    },
  });
}

export async function getProviderForEmail(
  email: string,
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { user: { email } },
    select: { provider: true },
  });
  return account?.provider ?? null;
}
