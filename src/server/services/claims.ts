import type { z } from "zod";
import type { ClaimStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError, conflict, notFound } from "../errors";
import { randomString } from "../crypto";
import { assertCan, type Actor } from "../auth/permissions";
import type { claimSchema } from "../validation";
import { audit } from "./audit";
import { normalizeCode } from "./warranty-codes";
import { claimImageUrl, deleteClaimImages, storeClaimImages, type ValidatedImage } from "./claim-images";

const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED"],
  ADDITIONAL_INFO_REQUIRED: ["UNDER_REVIEW", "REJECTED"],
  APPROVED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
};

/**
 * Submit a claim. Claims are never auto-approved: an active warranty only makes a claim eligible for review.
 * `actor` is null for a verified patient on the public page (the route checks verification).
 * `images` must already be validated (`validateClaimImages`); they are stored before the DB transaction
 * and removed again if it fails.
 */
export async function submitClaim(actor: Actor | null, rawCode: string, input: z.infer<typeof claimSchema>, images: ValidatedImage[] = []) {
  if (actor) assertCan(actor, "claim:submit");
  const wc = await prisma.warrantyCode.findUnique({ where: { code: normalizeCode(rawCode) }, include: { case: true } });
  if (!wc || !wc.case) throw notFound("Bảo hành chưa được kích hoạt");
  if (wc.revokedAt) throw conflict("Mã đã bị thu hồi");
  if (actor && (actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF") && wc.case.laboratoryId !== actor.laboratoryId) throw notFound();
  if (actor?.role === "CLINIC_USER" && wc.case.clinicId !== actor.clinicId) throw notFound();
  const year = new Date().getUTCFullYear();
  const imageKeys = images.length ? await storeClaimImages(images) : [];
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.warrantyClaim.create({
        data: {
          claimNumber: `CLM-${year}-${randomString(6)}`,
          warrantyCodeId: wc.id,
          restorationCaseId: wc.case!.id,
          ...input,
          imageUrls: imageKeys,
          submittedById: actor?.userId ?? null,
          events: { create: { toStatus: "SUBMITTED", actorId: actor?.userId ?? null, note: "Tiếp nhận yêu cầu" } },
        },
      });
      await audit(actor, { action: "claim.submit", entityType: "WarrantyClaim", entityId: c.id, laboratoryId: wc.case!.laboratoryId, metadata: { code: wc.code, images: imageKeys.length } }, tx);
      return c;
    });
  } catch (e) {
    await deleteClaimImages(imageKeys);
    throw e;
  }
}

export async function listClaims(actor: Actor, params: { status?: ClaimStatus; page: number; pageSize: number }) {
  const where: Prisma.WarrantyClaimWhereInput = { status: params.status };
  if (actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF") where.restorationCase = { laboratoryId: actor.laboratoryId! };
  else assertCan(actor, "claim:manage");
  const [items, total] = await Promise.all([
    prisma.warrantyClaim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { warrantyCode: { select: { code: true, product: { select: { name: true } } } }, events: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.warrantyClaim.count({ where }),
  ]);
  // Storage keys stay internal; clients get authorized API URLs.
  return { items: items.map(({ imageUrls, ...c }) => ({ ...c, images: imageUrls.map((k) => claimImageUrl(c.id, k)) })), total };
}

export async function updateClaimStatus(actor: Actor, claimId: string, status: ClaimStatus, note: string | null) {
  assertCan(actor, "claim:manage");
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw notFound();
  if (!TRANSITIONS[claim.status].includes(status)) {
    throw new AppError("CONFLICT", `Không thể chuyển trạng thái từ ${claim.status} sang ${status}`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.warrantyClaim.update({ where: { id: claimId }, data: { status } });
    await tx.warrantyClaimEvent.create({ data: { claimId, fromStatus: claim.status, toStatus: status, note, actorId: actor.userId } });
    await audit(actor, { action: "claim.status", entityType: "WarrantyClaim", entityId: claimId, metadata: { from: claim.status, to: status } }, tx);
    return updated;
  });
}
