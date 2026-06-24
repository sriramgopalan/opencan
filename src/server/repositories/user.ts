import { createId } from "@paralleldrive/cuid2";
import type { Role } from "@prisma/client";

import { AppError } from "@/lib/errors";
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
): Promise<{ id: string; passwordHash: string | null; failedLoginCount: number; lockedUntil: Date | null; suspendedAt: Date | null; role: string } | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
      suspendedAt: true,
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
      email: `deleted-${anonId}@deleted.opencan.dev`,
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

export async function getSuspendedAt(email: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { suspendedAt: true },
  });
  return user?.suspendedAt ?? null;
}

export async function getUserRoleAndStatus(
  userId: string,
): Promise<{ id: string; email: string; role: string; suspendedAt: Date | null } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, suspendedAt: true },
  });
}

export async function setUserRole(
  userId: string,
  role: Role,
): Promise<{ id: string; role: Role }> {
  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, role: true },
  });
}

export async function suspendUser(
  userId: string,
): Promise<{ id: string; suspendedAt: Date }> {
  const now = new Date();
  return prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: now },
    select: { id: true, suspendedAt: true },
  }) as Promise<{ id: string; suspendedAt: Date }>;
}

export async function unsuspendUser(
  userId: string,
): Promise<{ id: string; suspendedAt: null }> {
  return prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: null },
    select: { id: true, suspendedAt: true },
  }) as Promise<{ id: string; suspendedAt: null }>;
}

export async function deleteUserAccount(userId: string, email: string): Promise<void> {
  await prisma.$transaction([
    prisma.comment.updateMany({
      where: { authorId: userId },
      data: { authorId: null, body: "[deleted]" },
    }),
    prisma.vote.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    prisma.organizationMember.deleteMany({ where: { userId } }),
  ]);
  await anonymiseUser(userId);
}

// Hard-deletes a user: tombstones comment bodies, nulls post authorship, removes votes,
// then hard-deletes the user row (cascades sessions, accounts, org memberships).
// NOTE: fails at the DB level if the user owns boards (Board.onDelete = Restrict).
// The caller must blocklist the user before invoking this function.
export async function getNotificationPreference(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifyOnStatusChange: true },
  });
  return user?.notifyOnStatusChange ?? true;
}

export async function getNotificationPreferences(
  userId: string,
): Promise<{ notifyOnStatusChange: boolean; notifyOnChangelog: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifyOnStatusChange: true, notifyOnChangelog: true },
  });
  return {
    notifyOnStatusChange: user?.notifyOnStatusChange ?? true,
    notifyOnChangelog: user?.notifyOnChangelog ?? true,
  };
}

export async function setNotificationPreference(
  userId: string,
  value: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { notifyOnStatusChange: value },
  });
}

export async function setNotificationPreferences(
  userId: string,
  prefs: { notifyOnStatusChange?: boolean; notifyOnChangelog?: boolean },
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: prefs,
  });
}

export async function upsertWidgetUser(email: string, name: string | null): Promise<SafeUser> {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      emailVerified: new Date(),
    },
    select: SAFE_USER_SELECT,
  });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (current?.role === "ADMIN") {
      throw new AppError("FORBIDDEN", "Cannot delete an admin user.");
    }
    await tx.comment.updateMany({
      where: { authorId: userId },
      data: { authorId: null, body: "[deleted]" },
    });
    await tx.post.updateMany({
      where: { authorId: userId },
      data: { authorId: null },
    });
    await tx.vote.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
