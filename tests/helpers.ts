import { prisma } from "@/server/db";
import type { Actor } from "@/server/auth/permissions";
import { hashPassword } from "@/server/crypto";
import { resetRateLimits } from "@/server/rate-limit";
import type { ActivationInput } from "@/server/validation";
import type { Role } from "@prisma/client";

export async function resetDb() {
  resetRateLimits();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function makeUser(role: Role, extra: { laboratoryId?: string; email?: string; password?: string } = {}): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: extra.email ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} user`,
      role,
      status: "ACTIVE",
      laboratoryId: extra.laboratoryId,
      passwordHash: extra.password ? await hashPassword(extra.password) : null,
    },
  });
  return { userId: user.id, role, name: user.name, email: user.email, laboratoryId: user.laboratoryId, clinicId: null, brandIds: [], sessionId: "test" };
}

export async function seedBasics(opts: { durationMonths?: number; startRule?: "INSTALLATION_DATE" | "ACTIVATION_DATE" | "COMPLETION_DATE" } = {}) {
  const admin = await makeUser("SUPER_ADMIN");
  const brand = await prisma.brand.create({ data: { name: "Origin", slug: "origin", codePrefix: "OR", primaryColor: "#0B1F3A", secondaryColor: "#C9A96E" } });
  const product = await prisma.product.create({ data: { brandId: brand.id, sku: "OBP", name: "Origin Beyond Plus" } });
  const policy = await prisma.warrantyPolicy.create({
    data: { productId: product.id, version: 1, durationMonths: opts.durationMonths ?? 120, startRule: opts.startRule ?? "INSTALLATION_DATE", conditions: "Điều kiện v1" },
  });
  const labA = await prisma.laboratory.create({ data: { code: "LAB-0001", name: "Labo A", brands: { create: [{ brandId: brand.id }] } } });
  const labB = await prisma.laboratory.create({ data: { code: "LAB-0002", name: "Labo B", brands: { create: [{ brandId: brand.id }] } } });
  const labAUser = await makeUser("LAB_STAFF", { laboratoryId: labA.id });
  const labBUser = await makeUser("LAB_STAFF", { laboratoryId: labB.id });
  return { admin, brand, product, policy, labA, labB, labAUser, labBUser };
}

export function activationInput(overrides: Partial<ActivationInput["restoration"]> = {}): ActivationInput {
  return {
    patient: { fullName: "Nguyễn Văn A", phone: "0901 234 567", birthYear: 1985, externalRef: null, consent: true },
    clinic: { clinicId: null, name: "Nha khoa Sài Gòn", dentistName: "BS. Trần B", phone: null },
    restoration: {
      restorationType: "Cầu răng (Bridge)",
      teeth: [11, 12, 21, 22].map((toothNumber) => ({ toothNumber, restorationType: null, shade: "A2", notes: null })),
      completionDate: new Date("2026-10-01T00:00:00Z"),
      installationDate: new Date("2026-10-05T00:00:00Z"),
      warrantyMonths: 120,
      materialLotNumber: "LOT-2026-09",
      notes: null,
      ...overrides,
    },
  };
}
