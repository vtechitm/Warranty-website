import type { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { conflict, forbidden, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/permissions";
import { createInvitation } from "../auth/auth-service";
import type { laboratorySchema, laboratoryUpdateSchema, staffSchema } from "../validation";
import { audit } from "./audit";

async function nextLabCode(tx: Prisma.TransactionClient) {
  const count = await tx.laboratory.count();
  for (let n = count + 1; ; n++) {
    const code = `LAB-${String(n).padStart(4, "0")}`;
    if (!(await tx.laboratory.findUnique({ where: { code } }))) return code;
  }
}

export async function listLaboratories(actor: Actor, params: { q?: string; page?: number; pageSize?: number } = {}) {
  assertCan(actor, "laboratory:read");
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  const where: Prisma.LaboratoryWhereInput = {
    deletedAt: null,
    OR: params.q
      ? [{ name: { contains: params.q, mode: "insensitive" } }, { code: { contains: params.q, mode: "insensitive" } }, { phone: { contains: params.q } }]
      : undefined,
    brands: actor.role === "BRAND_ADMIN" ? { some: { brandId: { in: actor.brandIds } } } : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.laboratory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        brands: { include: { brand: { select: { id: true, name: true } } } },
        _count: { select: { codes: true, activations: true, users: true } },
      },
    }),
    prisma.laboratory.count({ where }),
  ]);
  return { items, total };
}

export async function getLaboratory(actor: Actor, id: string) {
  if (actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF") {
    if (actor.laboratoryId !== id) throw forbidden();
  } else assertCan(actor, "laboratory:read");
  const lab = await prisma.laboratory.findFirst({
    where: { id, deletedAt: null },
    include: {
      brands: { include: { brand: true } },
      users: { where: { deletedAt: null }, select: { id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true } },
    },
  });
  if (!lab) throw notFound();
  const [activated, units] = await Promise.all([
    prisma.restorationCase.count({ where: { laboratoryId: id, warrantyCode: { revokedAt: null } } }),
    prisma.unitBalance.aggregate({ where: { laboratoryId: id }, _sum: { balance: true } }),
  ]);
  return { ...lab, stats: { activated, unitsLeft: units._sum.balance ?? 0 } };
}

export async function createLaboratory(actor: Actor, input: z.infer<typeof laboratorySchema>) {
  assertCan(actor, "laboratory:manage");
  const { brandIds, admin, ...data } = input;
  if (admin && (await prisma.user.findUnique({ where: { email: admin.email } }))) throw conflict("Email quản trị viên đã được sử dụng");
  const result = await prisma.$transaction(async (tx) => {
    const lab = await tx.laboratory.create({
      data: { ...data, code: await nextLabCode(tx), brands: { create: brandIds.map((brandId) => ({ brandId })) } },
    });
    let adminUser = null;
    if (admin) {
      adminUser = await tx.user.create({ data: { email: admin.email, name: admin.name, role: "LAB_ADMIN", status: "INVITED", laboratoryId: lab.id } });
    }
    await audit(actor, { action: "laboratory.create", entityType: "Laboratory", entityId: lab.id, laboratoryId: lab.id, metadata: { name: lab.name, brandIds } }, tx);
    return { lab, adminUser };
  });
  const invitation = result.adminUser ? await createInvitation(result.adminUser.id) : null;
  return { laboratory: result.lab, invitation };
}

export async function updateLaboratory(actor: Actor, id: string, input: z.infer<typeof laboratoryUpdateSchema>) {
  assertCan(actor, "laboratory:manage");
  const { brandIds, ...data } = input;
  const lab = await prisma.$transaction(async (tx) => {
    const lab = await tx.laboratory.update({ where: { id }, data });
    if (brandIds) {
      await tx.laboratoryBrand.deleteMany({ where: { laboratoryId: id, brandId: { notIn: brandIds } } });
      await tx.laboratoryBrand.createMany({ data: brandIds.map((brandId) => ({ laboratoryId: id, brandId })), skipDuplicates: true });
    }
    if (data.status === "SUSPENDED") {
      const users = await tx.user.findMany({ where: { laboratoryId: id }, select: { id: true } });
      await tx.deviceSession.updateMany({ where: { userId: { in: users.map((u) => u.id) }, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(actor, { action: "laboratory.update", entityType: "Laboratory", entityId: id, laboratoryId: id, metadata: input as Prisma.InputJsonValue }, tx);
    return lab;
  });
  return lab;
}

// ─────────────── Lab staff ───────────────

function assertStaffManager(actor: Actor, laboratoryId: string) {
  assertCan(actor, "lab-staff:manage");
  if (actor.role === "LAB_ADMIN" && actor.laboratoryId !== laboratoryId) throw forbidden();
}

export async function listStaff(actor: Actor, laboratoryId: string) {
  assertStaffManager(actor, laboratoryId);
  return prisma.user.findMany({
    where: { laboratoryId, deletedAt: null },
    select: { id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function inviteStaff(actor: Actor, laboratoryId: string, input: z.infer<typeof staffSchema>) {
  assertStaffManager(actor, laboratoryId);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict("Email đã được sử dụng");
  const user = await prisma.user.create({ data: { ...input, laboratoryId, status: "INVITED" } });
  await audit(actor, { action: "lab_staff.invite", entityType: "User", entityId: user.id, laboratoryId, metadata: { email: user.email, role: user.role } });
  const invitation = await createInvitation(user.id);
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status }, invitation };
}

export async function resendInvitation(actor: Actor, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  if (user.laboratoryId) assertStaffManager(actor, user.laboratoryId);
  else assertCan(actor, "user:manage");
  await audit(actor, { action: "user.invitation_reissue", entityType: "User", entityId: userId, laboratoryId: user.laboratoryId });
  return createInvitation(userId);
}

export async function setStaffStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.laboratoryId) throw notFound();
  assertStaffManager(actor, user.laboratoryId);
  if (user.id === actor.userId) throw forbidden("Không thể tự khóa tài khoản của chính mình");
  if (status === "ACTIVE" && !user.passwordHash) throw conflict("Người dùng chưa chấp nhận lời mời");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") await tx.deviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(actor, { action: "lab_staff.status", entityType: "User", entityId: userId, laboratoryId: user.laboratoryId, metadata: { status } }, tx);
  });
}

// ─────────────── Clinics (lab-scoped searchable list) ───────────────

export async function searchClinics(actor: Actor, q: string | undefined) {
  const labId = actor.laboratoryId;
  return prisma.clinic.findMany({
    where: {
      deletedAt: null,
      OR: actor.role === "SUPER_ADMIN" ? undefined : [{ laboratoryId: labId }, { laboratoryId: null }],
      name: q ? { contains: q, mode: "insensitive" } : undefined,
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, address: true, phone: true },
  });
}
