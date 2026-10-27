import { Prisma, type WarrantyPolicy } from "@prisma/client";
import { prisma } from "../db";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { decryptField, encryptField, hashToken, phoneHash, randomString } from "../crypto";
import { assertBrandAccess, assertCan, requireLab, type Actor } from "../auth/permissions";
import type { ActivationInput } from "../validation";
import { audit } from "./audit";
import { normalizeCode } from "./warranty-codes";
import { computePublicState, computeValidity, todayVN, warrantyEndDate } from "./validity";
import { warrantyUrl } from "./qr";

export const CONSENT_VERSION = "2026-10";

export type PolicySnapshot = {
  policyId: string;
  version: number;
  /** Warranty duration applied to this case. Since the traceability model it is chosen by the laboratory. */
  durationMonths: number;
  /** "LABORATORY" = duration set by the activating lab; absent on records activated under the old Vtech-policy model. */
  provider?: "LABORATORY";
  /** Vtech's suggested duration for the product at activation time (for reference). */
  suggestedMonths?: number;
  startRule: WarrantyPolicy["startRule"];
  conditions: string | null;
  exclusions: string | null;
  claimInstructions: string | null;
  careInstructions: string | null;
  benefits: string | null;
};

export function snapshotPolicy(p: WarrantyPolicy): PolicySnapshot {
  return {
    policyId: p.id, version: p.version, durationMonths: p.durationMonths, startRule: p.startRule,
    conditions: p.conditions, exclusions: p.exclusions, claimInstructions: p.claimInstructions,
    careInstructions: p.careInstructions, benefits: p.benefits,
  };
}

/** Patient access code printed on the certificate, e.g. "K8M4-P2X9". */
function newAccessCode() {
  const raw = randomString(8);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
export function hashAccessCode(code: string) {
  return hashToken(`access:${code.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`);
}

/** Decide warranty start date from the policy rule. null = waiting for confirmation. */
export function resolveStartDate(
  rule: WarrantyPolicy["startRule"],
  dates: { installationDate?: Date | null; completionDate?: Date | null; activatedAt: Date },
): Date | null {
  switch (rule) {
    case "INSTALLATION_DATE":
      return dates.installationDate ?? null;
    case "COMPLETION_DATE":
      return dates.completionDate ?? null;
    case "ACTIVATION_DATE":
      return todayVN(dates.activatedAt);
  }
}

const reasons = {
  NOT_FOUND: "Mã bảo hành không tồn tại. Vui lòng kiểm tra lại.",
  NOT_ASSIGNED: "Mã này không được cấp cho labo của bạn.",
  ALREADY_ACTIVATED: "Mã này đã được kích hoạt trước đó.",
  REVOKED: "Mã này đã bị thu hồi. Vui lòng liên hệ Vtech.",
  BRAND_NOT_AUTHORIZED: "Labo chưa được ủy quyền cho thương hiệu này.",
  NO_POLICY: "Sản phẩm chưa có thông tin phôi. Vui lòng liên hệ Vtech.",
} as const;

/** Step 3 of the lab workflow: verify the code can be activated by this lab. */
export async function checkCodeForActivation(actor: Actor, rawCode: string) {
  assertCan(actor, "warranty:activate");
  const labId = requireLab(actor);
  const code = normalizeCode(rawCode);
  const wc = await prisma.warrantyCode.findUnique({
    where: { code },
    include: {
      brand: { select: { id: true, name: true, primaryColor: true, secondaryColor: true, logoUrl: true } },
      product: { select: { id: true, name: true, sku: true, materialType: true, origin: true } },
      batch: { select: { qrBaseUrl: true } },
    },
  });
  // Codes assigned to another lab are reported exactly like "not assigned to you" (no cross-lab leakage).
  if (!wc) throw new AppError("NOT_FOUND", reasons.NOT_FOUND, undefined, "NOT_FOUND");
  if (wc.assignedLaboratoryId !== labId) throw new AppError("FORBIDDEN", reasons.NOT_ASSIGNED, undefined, "NOT_ASSIGNED");
  if (wc.revokedAt) throw new AppError("CONFLICT", reasons.REVOKED, undefined, "REVOKED");
  if (wc.activationStatus === "ACTIVATED") throw new AppError("CONFLICT", reasons.ALREADY_ACTIVATED, { code: wc.code }, "ALREADY_ACTIVATED");
  const authorized = await prisma.laboratoryBrand.findUnique({ where: { laboratoryId_brandId: { laboratoryId: labId, brandId: wc.brandId } } });
  if (!authorized) throw new AppError("FORBIDDEN", reasons.BRAND_NOT_AUTHORIZED, undefined, "BRAND_NOT_AUTHORIZED");
  const policy = await prisma.warrantyPolicy.findFirst({ where: { productId: wc.productId, isCurrent: true }, orderBy: { version: "desc" } });
  if (!policy) throw new AppError("CONFLICT", reasons.NO_POLICY, undefined, "NO_POLICY");
  return {
    code: wc.code,
    url: warrantyUrl(wc.batch.qrBaseUrl, wc.code),
    brand: wc.brand,
    product: wc.product,
    /** Vtech's product information; `suggestedMonths` pre-fills the lab's warranty duration. */
    policy: { version: policy.version, suggestedMonths: policy.durationMonths, careInstructions: policy.careInstructions },
  };
}

function assertReasonableDates(input: ActivationInput) {
  const today = todayVN();
  const max = new Date(today.getTime() + 30 * 86_400_000);
  const min = new Date(Date.UTC(2015, 0, 1));
  const { installationDate, completionDate } = input.restoration;
  if (completionDate && (completionDate > max || completionDate < min)) throw new AppError("VALIDATION_ERROR", "Ngày hoàn thành không hợp lệ");
  if (installationDate && (installationDate > max || installationDate < min)) throw new AppError("VALIDATION_ERROR", "Ngày lắp không hợp lệ");
  if (installationDate && completionDate && installationDate < completionDate) {
    throw new AppError("VALIDATION_ERROR", "Ngày lắp không thể trước ngày hoàn thành phục hình");
  }
}

/**
 * Activates a pre-generated warranty code. Transactional and concurrency-safe:
 * the conditional UPDATE … WHERE activationStatus = NOT_ACTIVATED only succeeds for one
 * request, and WarrantyActivation.warrantyCodeId is UNIQUE as a second guard.
 */
export async function activateWarranty(actor: Actor, rawCode: string, input: ActivationInput) {
  const checked = await checkCodeForActivation(actor, rawCode);
  const labId = requireLab(actor);
  assertReasonableDates(input);
  const accessCode = newAccessCode();

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const wc = await tx.warrantyCode.findUniqueOrThrow({ where: { code: checked.code } });
      const claimed = await tx.warrantyCode.updateMany({
        where: { id: wc.id, activationStatus: "NOT_ACTIVATED", assignedLaboratoryId: labId, revokedAt: null },
        data: { activationStatus: "ACTIVATED", activatedAt: now },
      });
      if (claimed.count !== 1) throw new AppError("CONFLICT", reasons.ALREADY_ACTIVATED, { code: wc.code }, "ALREADY_ACTIVATED");

      const policy = await tx.warrantyPolicy.findFirst({ where: { productId: wc.productId, isCurrent: true }, orderBy: { version: "desc" } });
      if (!policy) throw new AppError("CONFLICT", reasons.NO_POLICY, undefined, "NO_POLICY");

      // Clinic: existing (must be visible to this lab) or create in the lab's own list.
      let clinicId: string | null = null;
      let clinicName = input.clinic.name;
      if (input.clinic.clinicId) {
        const clinic = await tx.clinic.findFirst({ where: { id: input.clinic.clinicId, deletedAt: null, OR: [{ laboratoryId: labId }, { laboratoryId: null }] } });
        if (!clinic) throw forbidden("Phòng khám không hợp lệ");
        clinicId = clinic.id;
        clinicName = clinic.name;
      } else if (input.clinic.name) {
        const existing = await tx.clinic.findFirst({ where: { laboratoryId: labId, deletedAt: null, name: { equals: input.clinic.name, mode: "insensitive" } } });
        const clinic = existing ?? (await tx.clinic.create({ data: { laboratoryId: labId, name: input.clinic.name, phone: input.clinic.phone } }));
        clinicId = clinic.id;
      }

      const patient = await tx.patient.create({
        data: {
          laboratoryId: labId,
          fullName: input.patient.fullName,
          phoneEnc: input.patient.phone ? encryptField(input.patient.phone) : null,
          phoneHash: phoneHash(input.patient.phone),
          birthYear: input.patient.birthYear ?? null,
          externalRef: input.patient.externalRef,
          consentAt: now,
          consentVersion: CONSENT_VERSION,
        },
      });

      let materialLotId: string | null = null;
      if (input.restoration.materialLotNumber) {
        const lot = await tx.materialLot.upsert({
          where: { productId_lotNumber: { productId: wc.productId, lotNumber: input.restoration.materialLotNumber } },
          create: { productId: wc.productId, lotNumber: input.restoration.materialLotNumber },
          update: {},
        });
        materialLotId = lot.id;
      }

      // The warranty is the laboratory's: it starts on the installation date and lasts the duration the lab entered.
      const months = input.restoration.warrantyMonths;
      const start = resolveStartDate("INSTALLATION_DATE", { ...input.restoration, activatedAt: now });
      const snapshot: PolicySnapshot = {
        ...snapshotPolicy(policy),
        durationMonths: months, startRule: "INSTALLATION_DATE", provider: "LABORATORY", suggestedMonths: policy.durationMonths,
        // Vtech's former warranty terms do not apply to a lab-provided warranty.
        conditions: null, exclusions: null, claimInstructions: null, benefits: null,
      };
      const rc = await tx.restorationCase.create({
        data: {
          warrantyCodeId: wc.id,
          laboratoryId: labId,
          patientId: patient.id,
          clinicId,
          brandId: wc.brandId,
          productId: wc.productId,
          clinicName,
          dentistName: input.clinic.dentistName,
          clinicPhone: input.clinic.phone,
          restorationType: input.restoration.restorationType,
          unitCount: input.restoration.teeth.length,
          completionDate: input.restoration.completionDate ?? null,
          installationDate: input.restoration.installationDate ?? null,
          installationStatus: start ? "CONFIRMED" : "PENDING_CONFIRMATION",
          warrantyStartDate: start,
          warrantyEndDate: start ? warrantyEndDate(start, months) : null,
          notes: input.restoration.notes,
          policyId: policy.id,
          policyVersion: policy.version,
          policySnapshot: snapshot as unknown as Prisma.InputJsonValue,
          accessCodeHash: hashAccessCode(accessCode),
          accessCodeEnc: encryptField(accessCode),
          units: {
            create: input.restoration.teeth
              .slice()
              .sort((a, b) => a.toothNumber - b.toothNumber)
              .map((t) => ({
                toothNumber: t.toothNumber,
                restorationType: t.restorationType ?? input.restoration.restorationType,
                productId: wc.productId,
                materialLotId,
                shade: t.shade,
                notes: t.notes,
              })),
          },
        },
      });

      await tx.warrantyActivation.create({
        data: {
          warrantyCodeId: wc.id, restorationCaseId: rc.id, laboratoryId: labId, activatedById: actor.userId,
          policyVersion: policy.version, ip: actor.ip ?? null, userAgent: actor.userAgent?.slice(0, 300) ?? null, activatedAt: now,
        },
      });

      await audit(actor, {
        action: "warranty.activate", entityType: "WarrantyCode", entityId: wc.id, laboratoryId: labId,
        metadata: { code: wc.code, caseId: rc.id, units: rc.unitCount, policyVersion: policy.version, warrantyMonths: months, suggestedMonths: policy.durationMonths, installationStatus: rc.installationStatus },
      }, tx);

      return {
        code: wc.code,
        url: checked.url,
        caseId: rc.id,
        accessCode,
        product: checked.product,
        brand: checked.brand,
        unitCount: rc.unitCount,
        teeth: input.restoration.teeth.map((t) => t.toothNumber).sort((a, b) => a - b),
        installationStatus: rc.installationStatus,
        warrantyStartDate: rc.warrantyStartDate,
        warrantyEndDate: rc.warrantyEndDate,
        durationMonths: months,
        activatedAt: now,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", reasons.ALREADY_ACTIVATED, { code: checked.code }, "ALREADY_ACTIVATED");
    }
    throw e;
  }
}

// ─────────────── Authorized access to full records ───────────────

async function loadCase(code: string) {
  const wc = await prisma.warrantyCode.findUnique({
    where: { code: normalizeCode(code) },
    include: {
      brand: true,
      product: true,
      batch: { select: { batchNumber: true, qrBaseUrl: true } },
      assignedLaboratory: { select: { id: true, name: true, code: true } },
      activation: { include: { activatedBy: { select: { name: true, email: true } } } },
      assignments: { orderBy: { assignedAt: "desc" }, include: { laboratory: { select: { name: true, code: true } } } },
      case: {
        include: {
          patient: true,
          clinic: true,
          laboratory: { select: { id: true, name: true, code: true, phone: true } },
          units: { orderBy: { toothNumber: "asc" }, include: { materialLot: true } },
        },
      },
    },
  });
  if (!wc) throw notFound("Mã bảo hành không tồn tại");
  return wc;
}

/** Full record (incl. patient data) for admin, owning lab, or the linked clinic. */
export async function getWarrantyDetail(actor: Actor, code: string) {
  const wc = await loadCase(code);
  const isLab = actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF";
  if (isLab) {
    if (wc.assignedLaboratoryId !== actor.laboratoryId && wc.case?.laboratoryId !== actor.laboratoryId) throw notFound("Mã bảo hành không tồn tại");
  } else if (actor.role === "CLINIC_USER") {
    if (!wc.case || !actor.clinicId || wc.case.clinicId !== actor.clinicId) throw notFound("Mã bảo hành không tồn tại");
  } else {
    assertCan(actor, "code:read-all");
    assertBrandAccess(actor, wc.brandId);
  }
  await audit(actor, { action: "warranty.view_private", entityType: "WarrantyCode", entityId: wc.id, laboratoryId: wc.case?.laboratoryId });
  const c = wc.case;
  const showPatient = actor.role !== "CLINIC_USER" && actor.role !== "BRAND_ADMIN";
  return {
    id: wc.id,
    code: wc.code,
    url: warrantyUrl(wc.batch.qrBaseUrl, wc.code),
    serial: wc.serial,
    batchNumber: wc.batch.batchNumber,
    brand: { id: wc.brand.id, name: wc.brand.name, primaryColor: wc.brand.primaryColor, secondaryColor: wc.brand.secondaryColor },
    product: { id: wc.product.id, name: wc.product.name, sku: wc.product.sku },
    assignmentStatus: wc.assignmentStatus,
    activationStatus: wc.activationStatus,
    revokedAt: wc.revokedAt,
    revokedReason: wc.revokedReason,
    assignedLaboratory: isLab ? null : wc.assignedLaboratory,
    assignments: isLab ? [] : wc.assignments.map((a) => ({ laboratory: a.laboratory, assignedAt: a.assignedAt, unassignedAt: a.unassignedAt })),
    publicState: computePublicState(wc, c),
    validity: computeValidity(c),
    activation: wc.activation ? { activatedAt: wc.activation.activatedAt, activatedBy: wc.activation.activatedBy.name, policyVersion: wc.activation.policyVersion } : null,
    case: c
      ? {
          id: c.id,
          laboratory: c.laboratory,
          patient: showPatient
            ? { fullName: c.patient.fullName, phone: decryptField(c.patient.phoneEnc), birthYear: c.patient.birthYear, externalRef: c.patient.externalRef }
            : null,
          clinicName: c.clinicName,
          dentistName: c.dentistName,
          clinicPhone: c.clinicPhone,
          restorationType: c.restorationType,
          unitCount: c.unitCount,
          units: c.units.map((u) => ({ toothNumber: u.toothNumber, restorationType: u.restorationType, shade: u.shade, lotNumber: u.materialLot?.lotNumber ?? null, notes: u.notes })),
          completionDate: c.completionDate,
          installationDate: c.installationDate,
          installationStatus: c.installationStatus,
          warrantyStartDate: c.warrantyStartDate,
          warrantyEndDate: c.warrantyEndDate,
          suspendedAt: c.suspendedAt,
          suspendedReason: c.suspendedReason,
          notes: c.notes,
          policy: c.policySnapshot as unknown as PolicySnapshot,
          accessCode: showPatient ? decryptField(c.accessCodeEnc) : null,
        }
      : null,
  };
}
export type WarrantyDetail = Awaited<ReturnType<typeof getWarrantyDetail>>;

async function caseForChange(actor: Actor, code: string) {
  const wc = await prisma.warrantyCode.findUnique({ where: { code: normalizeCode(code) }, include: { case: true } });
  if (!wc || !wc.case) throw notFound("Bảo hành chưa được kích hoạt");
  if (actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF") {
    if (wc.case.laboratoryId !== actor.laboratoryId) throw notFound("Mã bảo hành không tồn tại");
  } else if (actor.role !== "SUPER_ADMIN") throw forbidden();
  if (wc.revokedAt) throw conflict("Mã đã bị thu hồi");
  return { wc, rc: wc.case };
}

/** Pending-confirmation workflow: set installation date later, using the policy snapshot from activation. */
export async function confirmInstallation(actor: Actor, code: string, installationDate: Date) {
  const { wc, rc } = await caseForChange(actor, code);
  if (rc.installationStatus === "CONFIRMED" && rc.installationDate) throw conflict("Ngày lắp đã được xác nhận. Dùng chức năng điều chỉnh nếu cần sửa.");
  if (installationDate > new Date(todayVN().getTime() + 86_400_000)) throw new AppError("VALIDATION_ERROR", "Ngày lắp không thể ở tương lai");
  if (rc.completionDate && installationDate < rc.completionDate) throw new AppError("VALIDATION_ERROR", "Ngày lắp không thể trước ngày hoàn thành");
  const snapshot = rc.policySnapshot as unknown as PolicySnapshot;
  const start = snapshot.startRule === "INSTALLATION_DATE" ? installationDate : rc.warrantyStartDate;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.restorationCase.update({
      where: { id: rc.id },
      data: {
        installationDate,
        installationStatus: start ? "CONFIRMED" : rc.installationStatus,
        warrantyStartDate: start,
        warrantyEndDate: start ? warrantyEndDate(start, snapshot.durationMonths) : null,
      },
    });
    await audit(actor, { action: "warranty.confirm_installation", entityType: "RestorationCase", entityId: rc.id, laboratoryId: rc.laboratoryId, metadata: { code: wc.code, installationDate: installationDate.toISOString().slice(0, 10) } }, tx);
    return updated;
  });
}

/** Authorized post-activation correction with before/after audit history. */
export async function correctWarranty(
  actor: Actor,
  code: string,
  patch: { patientName?: string; patientPhone?: string | null; clinicName?: string | null; dentistName?: string | null; notes?: string | null; installationDate?: Date | null; warrantyMonths?: number; reason: string },
) {
  assertCan(actor, "warranty:correct");
  const { wc, rc } = await caseForChange(actor, code);
  const snapshot = rc.policySnapshot as unknown as PolicySnapshot;
  return prisma.$transaction(async (tx) => {
    const before = { clinicName: rc.clinicName, dentistName: rc.dentistName, notes: rc.notes, installationDate: rc.installationDate, warrantyMonths: snapshot.durationMonths, warrantyEndDate: rc.warrantyEndDate };
    // Duration correction: stored in the case's snapshot (which drives every later date calculation).
    const months = patch.warrantyMonths ?? snapshot.durationMonths;
    if (patch.warrantyMonths !== undefined && patch.warrantyMonths !== snapshot.durationMonths) {
      const next: PolicySnapshot = { ...snapshot, durationMonths: patch.warrantyMonths, provider: "LABORATORY" };
      await tx.restorationCase.update({
        where: { id: rc.id },
        data: { policySnapshot: next as unknown as Prisma.InputJsonValue, warrantyEndDate: rc.warrantyStartDate ? warrantyEndDate(rc.warrantyStartDate, patch.warrantyMonths) : null },
      });
    }
    const caseData: Prisma.RestorationCaseUpdateInput = {};
    if (patch.clinicName !== undefined) caseData.clinicName = patch.clinicName;
    if (patch.dentistName !== undefined) caseData.dentistName = patch.dentistName;
    if (patch.notes !== undefined) caseData.notes = patch.notes;
    if (patch.installationDate !== undefined && patch.installationDate) {
      caseData.installationDate = patch.installationDate;
      if (snapshot.startRule === "INSTALLATION_DATE") {
        caseData.installationStatus = "CONFIRMED";
        caseData.warrantyStartDate = patch.installationDate;
        caseData.warrantyEndDate = warrantyEndDate(patch.installationDate, months);
      }
    }
    await tx.restorationCase.update({ where: { id: rc.id }, data: caseData });
    if (patch.patientName !== undefined || patch.patientPhone !== undefined) {
      await tx.patient.update({
        where: { id: rc.patientId },
        data: {
          fullName: patch.patientName ?? undefined,
          ...(patch.patientPhone !== undefined ? { phoneEnc: patch.patientPhone ? encryptField(patch.patientPhone) : null, phoneHash: phoneHash(patch.patientPhone) } : {}),
        },
      });
    }
    await audit(actor, {
      action: "warranty.correct", entityType: "RestorationCase", entityId: rc.id, laboratoryId: rc.laboratoryId,
      metadata: { code: wc.code, reason: patch.reason, before: JSON.parse(JSON.stringify(before)), changedFields: Object.keys(patch).filter((k) => k !== "reason") },
    }, tx);
    return { ok: true };
  });
}

export async function setSuspension(actor: Actor, code: string, suspended: boolean, reason: string) {
  assertCan(actor, "warranty:suspend");
  const { wc, rc } = await caseForChange(actor, code);
  await prisma.$transaction(async (tx) => {
    await tx.restorationCase.update({ where: { id: rc.id }, data: suspended ? { suspendedAt: new Date(), suspendedReason: reason } : { suspendedAt: null, suspendedReason: null } });
    await audit(actor, { action: suspended ? "warranty.suspend" : "warranty.unsuspend", entityType: "RestorationCase", entityId: rc.id, laboratoryId: rc.laboratoryId, metadata: { code: wc.code, reason } }, tx);
  });
}
