import { z } from "zod";
import { prisma } from "../db";
import { conflict, forbidden, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/permissions";
import { createInvitation } from "../auth/auth-service";
import { audit } from "./audit";

export const systemUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["SUPER_ADMIN", "BRAND_ADMIN"]),
  brandIds: z.array(z.string().uuid()).default([]),
});

export async function listSystemUsers(actor: Actor) {
  assertCan(actor, "user:manage");
  return prisma.user.findMany({
    where: { deletedAt: null, role: { in: ["SUPER_ADMIN", "BRAND_ADMIN"] } },
    select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, brands: { include: { brand: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSystemUser(actor: Actor, input: z.infer<typeof systemUserSchema>) {
  assertCan(actor, "user:manage");
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict("Email đã được sử dụng");
  const user = await prisma.user.create({
    data: {
      name: input.name, email: input.email, role: input.role, status: "INVITED",
      brands: input.role === "BRAND_ADMIN" ? { create: input.brandIds.map((brandId) => ({ brandId })) } : undefined,
    },
  });
  await audit(actor, { action: "user.create", entityType: "User", entityId: user.id, metadata: { email: user.email, role: user.role } });
  return { user: { id: user.id, email: user.email, role: user.role }, invitation: await createInvitation(user.id) };
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED") {
  assertCan(actor, "user:manage");
  if (userId === actor.userId) throw forbidden("Không thể tự khóa tài khoản của chính mình");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") await tx.deviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(actor, { action: "user.status", entityType: "User", entityId: userId, metadata: { status } }, tx);
  });
}
