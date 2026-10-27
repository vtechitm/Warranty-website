import type { z } from "zod";
import { resolveTxt } from "node:dns/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError, conflict, notFound } from "../errors";
import { randomToken } from "../crypto";
import { assertBrandAccess, assertCan, brandScope, type Actor } from "../auth/permissions";
import type { brandDomainSchema, brandSchema, brandUpdateSchema, policySchema, productSchema, productUpdateSchema } from "../validation";
import { audit } from "./audit";

function uniqueViolation(e: unknown, msg: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict(msg);
  throw e;
}

// ─────────────── Brands ───────────────

export async function listBrands(actor: Actor) {
  assertCan(actor, "brand:read");
  const scope = brandScope(actor);
  const brands = await prisma.brand.findMany({
    where: { deletedAt: null, id: scope ? { in: scope } : undefined },
    orderBy: { name: "asc" },
    include: { domains: true, _count: { select: { products: true, codes: true } } },
  });
  return brands;
}

export async function getBrand(actor: Actor, id: string) {
  assertCan(actor, "brand:read");
  assertBrandAccess(actor, id);
  const brand = await prisma.brand.findFirst({ where: { id, deletedAt: null }, include: { domains: true, products: { where: { deletedAt: null } } } });
  if (!brand) throw notFound();
  return brand;
}

export async function createBrand(actor: Actor, input: z.infer<typeof brandSchema>) {
  assertCan(actor, "brand:manage");
  try {
    const brand = await prisma.brand.create({ data: input });
    await audit(actor, { action: "brand.create", entityType: "Brand", entityId: brand.id, metadata: { name: brand.name } });
    return brand;
  } catch (e) {
    uniqueViolation(e, "Slug hoặc tiền tố mã đã tồn tại");
  }
}

export async function updateBrand(actor: Actor, id: string, input: z.infer<typeof brandUpdateSchema>) {
  assertCan(actor, "brand:manage");
  try {
    const brand = await prisma.brand.update({ where: { id }, data: input });
    await audit(actor, { action: "brand.update", entityType: "Brand", entityId: id, metadata: input as Prisma.InputJsonValue });
    return brand;
  } catch (e) {
    uniqueViolation(e, "Slug đã tồn tại");
  }
}

export async function addBrandDomain(actor: Actor, brandId: string, input: z.infer<typeof brandDomainSchema>) {
  assertCan(actor, "brand:manage");
  try {
    const domain = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.brandDomain.updateMany({ where: { brandId }, data: { isPrimary: false } });
      return tx.brandDomain.create({ data: { ...input, brandId, verificationToken: `vtech-verify-${randomToken(12)}` } });
    });
    await audit(actor, { action: "brand.domain_add", entityType: "BrandDomain", entityId: domain.id, metadata: { hostname: domain.hostname } });
    return domain;
  } catch (e) {
    uniqueViolation(e, "Tên miền đã được sử dụng");
  }
}

/**
 * Verifies domain ownership via a DNS TXT record `_vtech-verify.<hostname>` = verificationToken.
 * Outside production (or with ALLOW_MANUAL_DOMAIN_VERIFY=true) an admin may confirm manually.
 * Only verified hostnames are trusted for Host-header brand resolution.
 */
export async function verifyBrandDomain(actor: Actor, domainId: string) {
  assertCan(actor, "brand:manage");
  const existing = await prisma.brandDomain.findUnique({ where: { id: domainId } });
  if (!existing) throw notFound();
  const host = existing.hostname.split(":")[0];
  let method: "dns" | "manual" = "manual";
  try {
    const records = (await resolveTxt(`_vtech-verify.${host}`)).map((r) => r.join(""));
    if (records.includes(existing.verificationToken)) method = "dns";
  } catch {
    // no record / lookup failure — fall through
  }
  const manualAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_MANUAL_DOMAIN_VERIFY === "true";
  if (method === "manual" && !manualAllowed) {
    throw new AppError("CONFLICT", `Chưa tìm thấy bản ghi TXT _vtech-verify.${host} = ${existing.verificationToken}`);
  }
  const domain = await prisma.brandDomain.update({ where: { id: domainId }, data: { verifiedAt: new Date() } });
  await audit(actor, { action: "brand.domain_verify", entityType: "BrandDomain", entityId: domainId, metadata: { hostname: domain.hostname, method } });
  return domain;
}

export async function removeBrandDomain(actor: Actor, domainId: string) {
  assertCan(actor, "brand:manage");
  const domain = await prisma.brandDomain.delete({ where: { id: domainId } });
  await audit(actor, { action: "brand.domain_remove", entityType: "BrandDomain", entityId: domainId, metadata: { hostname: domain.hostname } });
}

/** Only verified hostnames are trusted; arbitrary Host headers resolve to no brand. */
export async function resolveBrandByHost(host: string | null | undefined) {
  if (!host) return null;
  const hostname = host.trim().toLowerCase();
  const domain = await prisma.brandDomain.findUnique({ where: { hostname }, include: { brand: { include: { domains: true } } } });
  if (!domain || !domain.verifiedAt || !domain.brand.isActive || domain.brand.deletedAt) return null;
  return { domain, brand: domain.brand };
}

export function primaryDomain(brand: { domains: { hostname: string; isPrimary: boolean; verifiedAt: Date | null }[] }) {
  return brand.domains.find((d) => d.isPrimary && d.verifiedAt) ?? null;
}

// ─────────────── Products ───────────────

export async function listProducts(actor: Actor, params: { brandId?: string } = {}) {
  assertCan(actor, "product:read");
  const scope = brandScope(actor);
  let brandFilter: Prisma.StringFilter | string | undefined = params.brandId;
  if (actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF") {
    const labBrands = await prisma.laboratoryBrand.findMany({ where: { laboratoryId: actor.laboratoryId! } });
    brandFilter = { in: labBrands.map((b) => b.brandId).filter((b) => !params.brandId || b === params.brandId) };
  } else if (scope) {
    brandFilter = { in: scope.filter((b) => !params.brandId || b === params.brandId) };
  }
  return prisma.product.findMany({
    where: { deletedAt: null, brandId: brandFilter },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    include: { brand: { select: { id: true, name: true, codePrefix: true } }, policies: { where: { isCurrent: true } }, _count: { select: { codes: true } } },
  });
}

export async function getProduct(actor: Actor, id: string) {
  assertCan(actor, "product:read");
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: { brand: true, policies: { orderBy: { version: "desc" } } },
  });
  if (!product) throw notFound();
  if (actor.role === "BRAND_ADMIN") assertBrandAccess(actor, product.brandId);
  return product;
}

export async function createProduct(actor: Actor, input: z.infer<typeof productSchema>, policy?: z.infer<typeof policySchema>) {
  assertCan(actor, "product:manage");
  assertBrandAccess(actor, input.brandId);
  try {
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({ data: input });
      if (policy) await tx.warrantyPolicy.create({ data: { ...policy, productId: p.id, version: 1, createdById: actor.userId } });
      await audit(actor, { action: "product.create", entityType: "Product", entityId: p.id, metadata: { sku: p.sku, name: p.name } }, tx);
      return p;
    });
    return product;
  } catch (e) {
    uniqueViolation(e, "Mã SKU đã tồn tại trong thương hiệu này");
  }
}

export async function updateProduct(actor: Actor, id: string, input: z.infer<typeof productUpdateSchema>) {
  assertCan(actor, "product:manage");
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFound();
  assertBrandAccess(actor, existing.brandId);
  const product = await prisma.product.update({ where: { id }, data: input });
  await audit(actor, { action: "product.update", entityType: "Product", entityId: id, metadata: input as Prisma.InputJsonValue });
  return product;
}

// ─────────────── Warranty policies (versioned, never edited in place) ───────────────

export async function getCurrentPolicy(productId: string) {
  return prisma.warrantyPolicy.findFirst({ where: { productId, isCurrent: true }, orderBy: { version: "desc" } });
}

/**
 * Publishes a new policy version for a product. Previous versions are kept; already
 * activated warranties keep the snapshot they were activated with.
 */
export async function publishPolicyVersion(actor: Actor, productId: string, input: z.infer<typeof policySchema>) {
  assertCan(actor, "policy:manage");
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound();
  assertBrandAccess(actor, product.brandId);
  return prisma.$transaction(async (tx) => {
    const latest = await tx.warrantyPolicy.findFirst({ where: { productId }, orderBy: { version: "desc" } });
    await tx.warrantyPolicy.updateMany({ where: { productId, isCurrent: true }, data: { isCurrent: false } });
    const policy = await tx.warrantyPolicy.create({
      data: { ...input, productId, version: (latest?.version ?? 0) + 1, createdById: actor.userId, isCurrent: true },
    });
    await audit(actor, { action: "policy.publish", entityType: "WarrantyPolicy", entityId: policy.id, metadata: { productId, version: policy.version, durationMonths: policy.durationMonths } }, tx);
    return policy;
  });
}

export async function requireCurrentPolicy(productId: string) {
  const policy = await getCurrentPolicy(productId);
  if (!policy) throw new AppError("CONFLICT", "Sản phẩm chưa có thông tin phôi. Vui lòng liên hệ Vtech.", undefined, "NO_POLICY");
  return policy;
}
