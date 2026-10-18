import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { appUrl } from "../env";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { phoneHash, randomString } from "../crypto";
import { assertBrandAccess, assertCan, brandScope, type Actor } from "../auth/permissions";
import type { assignSchema, batchCreateSchema, warrantySearchSchema } from "../validation";
import { audit } from "./audit";
import { primaryDomain, requireCurrentPolicy } from "./catalog";
import { warrantyUrl } from "./qr";
import { lifecycleStatus } from "./validity";

export const CODE_RANDOM_LENGTH = 8;
const INSERT_CHUNK = 1000;
/** Batches up to this size are generated inline; larger ones run as a background job. */
export const INLINE_GENERATION_LIMIT = 2000;

/** ORG + 2-digit year: ORG26-K8M4P2X9 */
export function codePrefix(brandPrefix: string, date = new Date()) {
  return `${brandPrefix}${String(date.getUTCFullYear()).slice(-2)}`;
}

export function normalizeCode(input: string) {
  // Accept a full scanned URL as well as a typed code.
  const fromUrl = input.match(/\/w\/([A-Za-z0-9-]+)/);
  const raw = (fromUrl ? fromUrl[1] : input).trim().toUpperCase().replace(/\s+/g, "");
  return raw;
}

export const CODE_PATTERN = /^[A-Z]{2,4}\d{2}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

async function nextBatchNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getUTCFullYear();
  const count = await tx.warrantyBatch.count({ where: { batchNumber: { startsWith: `BATCH-${year}-` } } });
  for (let n = count + 1; ; n++) {
    const batchNumber = `BATCH-${year}-${String(n).padStart(3, "0")}`;
    if (!(await tx.warrantyBatch.findUnique({ where: { batchNumber } }))) return batchNumber;
  }
}

/** Creates a batch record. Call `generateBatchCodes` (inline or as a job) to fill it. */
export async function createBatch(actor: Actor, input: z.infer<typeof batchCreateSchema>) {
  assertCan(actor, "batch:generate");
  const product = await prisma.product.findFirst({ where: { id: input.productId, deletedAt: null }, include: { brand: { include: { domains: true } } } });
  if (!product || !product.isActive) throw notFound("Sản phẩm không tồn tại hoặc đã ngừng");
  await requireCurrentPolicy(product.id);
  const domain = primaryDomain(product.brand);
  // The QR base URL is frozen on the batch so printed codes never change if domains change later.
  const qrBaseUrl = domain ? `https://${domain.hostname}` : appUrl();
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.warrantyBatch.create({
      data: {
        batchNumber: await nextBatchNumber(tx),
        brandId: product.brandId, productId: product.id, quantity: input.quantity,
        notes: input.notes, qrBaseUrl, createdById: actor.userId, status: "PENDING",
      },
    });
    await audit(actor, { action: "batch.create", entityType: "WarrantyBatch", entityId: b.id, metadata: { batchNumber: b.batchNumber, productId: product.id, quantity: input.quantity } }, tx);
    return b;
  });
  return batch;
}

/**
 * Generates the batch's codes with a CSPRNG. Uniqueness is enforced by the DB unique
 * constraint: collisions are skipped by `createMany({ skipDuplicates })` and regenerated.
 * Idempotent / resumable: continues from the last generated serial.
 */
export async function generateBatchCodes(batchId: string) {
  const batch = await prisma.warrantyBatch.findUnique({ where: { id: batchId }, include: { brand: true } });
  if (!batch) throw notFound();
  if (batch.status === "COMPLETED") return batch;
  await prisma.warrantyBatch.update({ where: { id: batchId }, data: { status: "GENERATING", error: null } });
  const prefix = codePrefix(batch.brand.codePrefix, batch.createdAt);
  try {
    let generated = await prisma.warrantyCode.count({ where: { batchId } });
    let attempts = 0;
    while (generated < batch.quantity) {
      if (++attempts > 10_000) throw new Error("Không thể sinh đủ mã duy nhất");
      const need = Math.min(INSERT_CHUNK, batch.quantity - generated);
      const lastSerial = (await prisma.warrantyCode.aggregate({ where: { batchId }, _max: { serial: true } }))._max.serial ?? 0;
      const local = new Set<string>();
      while (local.size < need) local.add(`${prefix}-${randomString(CODE_RANDOM_LENGTH)}`);
      const codes = [...local];
      const res = await prisma.warrantyCode.createMany({
        data: codes.map((code, i) => ({
          code, serial: lastSerial + i + 1, batchId, brandId: batch.brandId, productId: batch.productId,
        })),
        skipDuplicates: true,
      });
      generated += res.count;
      // If a collision was skipped, serials may have a gap; renumber the chunk densely.
      if (res.count !== need) await renumberSerials(batchId);
      await prisma.warrantyBatch.update({ where: { id: batchId }, data: { generatedCount: generated } });
    }
    return prisma.warrantyBatch.update({ where: { id: batchId }, data: { status: "COMPLETED", completedAt: new Date(), generatedCount: generated } });
  } catch (e) {
    await prisma.warrantyBatch.update({ where: { id: batchId }, data: { status: "FAILED", error: String((e as Error).message).slice(0, 500) } });
    throw e;
  }
}

async function renumberSerials(batchId: string) {
  // Shift to a temporary range first to avoid (batchId, serial) unique conflicts.
  await prisma.$executeRaw`UPDATE "WarrantyCode" SET serial = -serial WHERE "batchId" = ${batchId}::uuid`;
  await prisma.$executeRaw`
    UPDATE "WarrantyCode" w SET serial = r.rn
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY -serial, "createdAt") AS rn FROM "WarrantyCode" WHERE "batchId" = ${batchId}::uuid) r
    WHERE w.id = r.id`;
}

/** In-process job runner. For multi-instance deployments replace with a queue (BullMQ/pg-boss). */
export function enqueueBatchGeneration(batchId: string) {
  setImmediate(() => {
    generateBatchCodes(batchId).catch((e) => console.error(`[batch ${batchId}] generation failed`, e));
  });
}

export async function createAndGenerateBatch(actor: Actor, input: z.infer<typeof batchCreateSchema>) {
  const batch = await createBatch(actor, input);
  if (input.quantity <= INLINE_GENERATION_LIMIT) return generateBatchCodes(batch.id);
  enqueueBatchGeneration(batch.id);
  return batch;
}

export async function listBatches(actor: Actor, params: { brandId?: string; productId?: string; q?: string; from?: Date; to?: Date; page: number; pageSize: number }) {
  assertCan(actor, "batch:read");
  const scope = brandScope(actor);
  const where: Prisma.WarrantyBatchWhereInput = {
    brandId: scope ? { in: scope.filter((b) => !params.brandId || b === params.brandId) } : params.brandId,
    productId: params.productId,
    batchNumber: params.q ? { contains: params.q, mode: "insensitive" } : undefined,
    createdAt: params.from || params.to ? { gte: params.from, lte: params.to } : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.warrantyBatch.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (params.page - 1) * params.pageSize, take: params.pageSize,
      include: { brand: { select: { name: true } }, product: { select: { name: true, sku: true } } },
    }),
    prisma.warrantyBatch.count({ where }),
  ]);
  const stats = await batchStats(items.map((b) => b.id));
  return { items: items.map((b) => ({ ...b, stats: stats.get(b.id) ?? emptyStats(b.generatedCount) })), total };
}

function emptyStats(total: number) {
  return { total, assigned: 0, activated: 0, revoked: 0, unassigned: total };
}

export async function batchStats(batchIds: string[]) {
  const map = new Map<string, ReturnType<typeof emptyStats>>();
  if (batchIds.length === 0) return map;
  const rows = await prisma.warrantyCode.groupBy({
    by: ["batchId", "assignmentStatus", "activationStatus"],
    where: { batchId: { in: batchIds } },
    _count: { _all: true },
  });
  const revoked = await prisma.warrantyCode.groupBy({ by: ["batchId"], where: { batchId: { in: batchIds }, revokedAt: { not: null } }, _count: { _all: true } });
  for (const id of batchIds) map.set(id, emptyStats(0));
  for (const r of rows) {
    const s = map.get(r.batchId)!;
    s.total += r._count._all;
    if (r.assignmentStatus === "ASSIGNED") s.assigned += r._count._all;
    else s.unassigned += r._count._all;
    if (r.activationStatus === "ACTIVATED") s.activated += r._count._all;
  }
  for (const r of revoked) map.get(r.batchId)!.revoked = r._count._all;
  return map;
}

export async function getBatch(actor: Actor, id: string) {
  assertCan(actor, "batch:read");
  const batch = await prisma.warrantyBatch.findUnique({
    where: { id },
    include: { brand: true, product: true, createdBy: { select: { name: true } } },
  });
  if (!batch) throw notFound();
  assertBrandAccess(actor, batch.brandId);
  const stats = (await batchStats([id])).get(id)!;
  const byLab = await prisma.warrantyCode.groupBy({ by: ["assignedLaboratoryId"], where: { batchId: id, assignedLaboratoryId: { not: null } }, _count: { _all: true } });
  const labs = await prisma.laboratory.findMany({ where: { id: { in: byLab.map((l) => l.assignedLaboratoryId!) } }, select: { id: true, name: true, code: true } });
  return {
    ...batch,
    stats,
    labs: byLab.map((l) => ({ laboratory: labs.find((x) => x.id === l.assignedLaboratoryId)!, count: l._count._all })),
  };
}

/** Codes of a batch in print order (for exports, ZIP and label sheets). */
export async function batchCodesForExport(actor: Actor, batchId: string, filter: { serialFrom?: number; serialTo?: number } = {}) {
  assertCan(actor, "batch:read");
  const batch = await prisma.warrantyBatch.findUnique({ where: { id: batchId }, include: { brand: true, product: true } });
  if (!batch) throw notFound();
  assertBrandAccess(actor, batch.brandId);
  const codes = await prisma.warrantyCode.findMany({
    where: { batchId, serial: filter.serialFrom || filter.serialTo ? { gte: filter.serialFrom, lte: filter.serialTo } : undefined },
    orderBy: { serial: "asc" },
    include: { assignedLaboratory: { select: { name: true, code: true } } },
  });
  return { batch, codes: codes.map((c) => ({ ...c, url: warrantyUrl(batch.qrBaseUrl, c.code), status: lifecycleStatus(c) })) };
}

// ─────────────── Search ───────────────

export async function searchCodes(actor: Actor, params: z.infer<typeof warrantySearchSchema>) {
  const isLab = actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF";
  if (isLab) assertCan(actor, "code:read-lab");
  else assertCan(actor, "code:read-all");
  const scope = brandScope(actor);
  const statusWhere: Prisma.WarrantyCodeWhereInput =
    params.status === "REVOKED" ? { revokedAt: { not: null } }
    : params.status === "ACTIVATED" ? { activationStatus: "ACTIVATED", revokedAt: null }
    : params.status === "ASSIGNED" ? { assignmentStatus: "ASSIGNED", activationStatus: "NOT_ACTIVATED", revokedAt: null }
    : params.status === "CREATED" ? { assignmentStatus: "UNASSIGNED", revokedAt: null }
    : {};
  const q = params.q?.trim();
  const canSearchPatient = actor.role === "SUPER_ADMIN" || actor.role === "LAB_ADMIN";
  const where: Prisma.WarrantyCodeWhereInput = {
    ...statusWhere,
    assignedLaboratoryId: isLab ? actor.laboratoryId! : params.laboratoryId,
    brandId: !isLab && scope ? { in: scope } : params.brandId,
    productId: params.productId,
    batchId: params.batchId,
    case: params.pending ? { installationStatus: "PENDING_CONFIRMATION" } : undefined,
    activatedAt: params.activatedFrom || params.activatedTo ? { gte: params.activatedFrom, lte: params.activatedTo ? new Date(params.activatedTo.getTime() + 86_399_999) : undefined } : undefined,
    OR: q
      ? [
          { code: { contains: q.toUpperCase() } },
          { case: { clinicName: { contains: q, mode: "insensitive" } } },
          ...(canSearchPatient
            ? [
                { case: { patient: { fullName: { contains: q, mode: "insensitive" as const } } } },
                ...(phoneHash(q) ? [{ case: { patient: { phoneHash: phoneHash(q)! } } }] : []),
              ]
            : []),
        ]
      : undefined,
  };
  if (isLab && params.laboratoryId && params.laboratoryId !== actor.laboratoryId) throw forbidden();
  const [items, total] = await Promise.all([
    prisma.warrantyCode.findMany({
      where,
      // Inside a batch, follow print order; elsewhere show most recent activity first.
      orderBy: params.batchId ? [{ serial: "asc" }] : [{ activatedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { serial: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        brand: { select: { name: true } },
        product: { select: { name: true } },
        batch: { select: { batchNumber: true } },
        assignedLaboratory: { select: { name: true, code: true } },
        case: {
          select: {
            clinicName: true, dentistName: true, unitCount: true, warrantyEndDate: true, warrantyStartDate: true, suspendedAt: true, installationStatus: true,
            patient: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.warrantyCode.count({ where }),
  ]);
  return { items: items.map((c) => ({ ...c, status: lifecycleStatus(c) })), total };
}

// ─────────────── Assignment ───────────────

export async function assignCodes(actor: Actor, input: z.infer<typeof assignSchema>) {
  assertCan(actor, "code:assign");
  const lab = await prisma.laboratory.findFirst({ where: { id: input.laboratoryId, deletedAt: null }, include: { brands: true } });
  if (!lab) throw notFound("Labo không tồn tại");
  if (lab.status !== "ACTIVE") throw conflict("Labo đang bị tạm ngưng");

  return prisma.$transaction(async (tx) => {
    let where: Prisma.WarrantyCodeWhereInput;
    if (input.codes?.length) {
      where = { code: { in: input.codes } };
    } else if (input.serialFrom && input.serialTo) {
      if (input.serialTo < input.serialFrom) throw new AppError("VALIDATION_ERROR", "Khoảng serial không hợp lệ");
      where = { batchId: input.batchId, serial: { gte: input.serialFrom, lte: input.serialTo } };
    } else {
      const ids = await tx.warrantyCode.findMany({
        where: { batchId: input.batchId, assignmentStatus: "UNASSIGNED", revokedAt: null },
        orderBy: { serial: "asc" }, take: input.quantity, select: { id: true },
      });
      if (ids.length < (input.quantity ?? 0)) throw conflict(`Lô chỉ còn ${ids.length} mã chưa phân bổ`);
      where = { id: { in: ids.map((i) => i.id) } };
    }
    const candidates = await tx.warrantyCode.findMany({ where, select: { id: true, code: true, brandId: true, activationStatus: true, revokedAt: true, assignedLaboratoryId: true } });
    if (input.codes?.length && candidates.length !== new Set(input.codes).size) {
      const found = new Set(candidates.map((c) => c.code));
      throw new AppError("VALIDATION_ERROR", "Một số mã không tồn tại", { missing: input.codes.filter((c) => !found.has(c)).slice(0, 50) });
    }
    const blocked = candidates.filter((c) => c.activationStatus === "ACTIVATED" || c.revokedAt);
    if (blocked.length) {
      throw new AppError("CONFLICT", "Không thể phân bổ mã đã kích hoạt hoặc đã thu hồi", { codes: blocked.slice(0, 50).map((c) => c.code) });
    }
    const labBrands = new Set(lab.brands.map((b) => b.brandId));
    const wrongBrand = candidates.filter((c) => !labBrands.has(c.brandId));
    if (wrongBrand.length) throw new AppError("CONFLICT", "Labo chưa được ủy quyền cho thương hiệu của các mã này", { codes: wrongBrand.slice(0, 20).map((c) => c.code) });

    const ids = candidates.map((c) => c.id);
    const now = new Date();
    // Close previous open assignments (re-assignment before activation).
    await tx.warrantyAssignment.updateMany({ where: { warrantyCodeId: { in: ids }, unassignedAt: null }, data: { unassignedAt: now } });
    const updated = await tx.warrantyCode.updateMany({
      where: { id: { in: ids }, activationStatus: "NOT_ACTIVATED", revokedAt: null },
      data: { assignmentStatus: "ASSIGNED", assignedLaboratoryId: lab.id, assignedAt: now },
    });
    if (updated.count !== ids.length) throw conflict("Một số mã vừa thay đổi trạng thái, vui lòng thử lại");
    await tx.warrantyAssignment.createMany({ data: ids.map((id) => ({ warrantyCodeId: id, laboratoryId: lab.id, assignedById: actor.userId, assignedAt: now, note: input.note })) });
    await audit(actor, {
      action: "code.assign", entityType: "WarrantyBatch", entityId: input.batchId ?? null, laboratoryId: lab.id,
      metadata: { count: ids.length, laboratory: lab.code, reassigned: candidates.filter((c) => c.assignedLaboratoryId && c.assignedLaboratoryId !== lab.id).length, sample: candidates.slice(0, 5).map((c) => c.code) },
    }, tx);
    return { assigned: ids.length, laboratoryId: lab.id };
  }, { timeout: 60_000 });
}

export async function unassignCodes(actor: Actor, codes: string[]) {
  assertCan(actor, "code:assign");
  return prisma.$transaction(async (tx) => {
    const list = await tx.warrantyCode.findMany({ where: { code: { in: codes }, activationStatus: "NOT_ACTIVATED" }, select: { id: true } });
    const ids = list.map((c) => c.id);
    await tx.warrantyAssignment.updateMany({ where: { warrantyCodeId: { in: ids }, unassignedAt: null }, data: { unassignedAt: new Date() } });
    const r = await tx.warrantyCode.updateMany({ where: { id: { in: ids }, activationStatus: "NOT_ACTIVATED" }, data: { assignmentStatus: "UNASSIGNED", assignedLaboratoryId: null, assignedAt: null } });
    await audit(actor, { action: "code.unassign", entityType: "WarrantyCode", metadata: { count: r.count, codes: codes.slice(0, 20) } }, tx);
    return { unassigned: r.count };
  });
}

// ─────────────── Revocation ───────────────

export async function revokeCode(actor: Actor, code: string, reason: string) {
  assertCan(actor, "code:revoke");
  return prisma.$transaction(async (tx) => {
    const wc = await tx.warrantyCode.findUnique({ where: { code } });
    if (!wc) throw notFound("Mã bảo hành không tồn tại");
    if (wc.revokedAt) throw conflict("Mã đã bị thu hồi trước đó");
    const updated = await tx.warrantyCode.update({ where: { id: wc.id }, data: { revokedAt: new Date(), revokedReason: reason, revokedById: actor.userId } });
    await audit(actor, { action: "code.revoke", entityType: "WarrantyCode", entityId: wc.id, laboratoryId: wc.assignedLaboratoryId, metadata: { code, reason } }, tx);
    return updated;
  });
}

export async function reinstateCode(actor: Actor, code: string, note: string) {
  assertCan(actor, "code:revoke");
  return prisma.$transaction(async (tx) => {
    const wc = await tx.warrantyCode.findUnique({ where: { code } });
    if (!wc) throw notFound();
    if (!wc.revokedAt) throw conflict("Mã chưa bị thu hồi");
    const updated = await tx.warrantyCode.update({ where: { id: wc.id }, data: { revokedAt: null, revokedReason: null, revokedById: null } });
    await audit(actor, { action: "code.reinstate", entityType: "WarrantyCode", entityId: wc.id, metadata: { code, note, previousReason: wc.revokedReason } }, tx);
    return updated;
  });
}
