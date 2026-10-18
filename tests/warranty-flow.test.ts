import { beforeEach, describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma } from "@/server/db";
import { createAndGenerateBatch, assignCodes, revokeCode, CODE_PATTERN } from "@/server/services/warranty-codes";
import { activateWarranty, checkCodeForActivation, confirmInstallation, getWarrantyDetail } from "@/server/services/activation";
import { getPrivatePassport, getPublicPassport, verifyPatientAccess, readPatientAccessToken } from "@/server/services/passport";
import { publishPolicyVersion } from "@/server/services/catalog";
import { certificatePdf } from "@/server/services/certificates";
import { submitClaim, updateClaimStatus } from "@/server/services/claims";
import { warrantyUrl } from "@/server/services/qr";
import { activationSchema } from "@/server/validation";
import { AppError } from "@/server/errors";
import { activationInput, makeUser, resetDb, seedBasics } from "./helpers";

type Ctx = Awaited<ReturnType<typeof seedBasics>>;
let ctx: Ctx;

async function batchOf(quantity: number) {
  return createAndGenerateBatch(ctx.admin, { productId: ctx.product.id, quantity, notes: null });
}

async function assignedCode() {
  const batch = await batchOf(5);
  await assignCodes(ctx.admin, { laboratoryId: ctx.labA.id, batchId: batch.id, quantity: 5, note: null });
  const code = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id }, orderBy: { serial: "asc" } });
  return { batch, code };
}

async function expectAppError(p: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
}

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
});

describe("warranty code generation", () => {
  it("1–3. generates 1,000 unique codes with stable URLs", async () => {
    const batch = await batchOf(1000);
    expect(batch.status).toBe("COMPLETED");
    const codes = await prisma.warrantyCode.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" } });
    expect(codes).toHaveLength(1000);
    expect(new Set(codes.map((c) => c.code)).size).toBe(1000);
    expect(codes.every((c) => CODE_PATTERN.test(c.code) && c.code.startsWith("ORG"))).toBe(true);
    // Dense, ordered serials for printing
    expect(codes.map((c) => c.serial)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));

    // URL is derived from the batch's frozen base URL — identical before & after activation
    const before = warrantyUrl(batch.qrBaseUrl, codes[0].code);
    expect(before).toBe(`${batch.qrBaseUrl}/w/${codes[0].code}`);
    await assignCodes(ctx.admin, { laboratoryId: ctx.labA.id, codes: [codes[0].code], note: null });
    await activateWarranty(ctx.labAUser, codes[0].code, activationInput());
    const pub = await getPublicPassport(codes[0].code);
    expect(pub!.url).toBe(before);
    const after = await prisma.warrantyCode.findUniqueOrThrow({ where: { id: codes[0].id } });
    expect(after.code).toBe(codes[0].code);
  });

  it("only super admins can generate codes", async () => {
    await expectAppError(createAndGenerateBatch(ctx.labAUser, { productId: ctx.product.id, quantity: 1, notes: null }), "FORBIDDEN");
  });
});

describe("public lookup", () => {
  it("4. unactivated code shows NOT_ACTIVATED without lab/inventory info", async () => {
    const { code } = await assignedCode();
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("NOT_ACTIVATED");
    expect(pub!.brand.name).toBe("Origin");
    expect(pub!.product.name).toBe("Origin Beyond Plus");
    expect(pub!.authorizedLaboratory).toBeNull();
    expect(JSON.stringify(pub)).not.toContain("Labo A");
  });

  it("unknown / malformed codes return null", async () => {
    expect(await getPublicPassport("ORG26-ZZZZZZZZ")).toBeNull();
    expect(await getPublicPassport("'; DROP TABLE x; --")).toBeNull();
  });
});

describe("assignment & activation", () => {
  it("5–6. admin assigns to Lab A and Lab A activates", async () => {
    const { code } = await assignedCode();
    const fresh = await prisma.warrantyCode.findUniqueOrThrow({ where: { id: code.id } });
    expect(fresh.assignmentStatus).toBe("ASSIGNED");
    expect(fresh.assignedLaboratoryId).toBe(ctx.labA.id);

    const check = await checkCodeForActivation(ctx.labAUser, code.code);
    expect(check.product.name).toBe("Origin Beyond Plus");

    const result = await activateWarranty(ctx.labAUser, code.code, activationInput());
    expect(result.unitCount).toBe(4);
    expect(result.teeth).toEqual([11, 12, 21, 22]);
    expect(result.accessCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const rc = await prisma.restorationCase.findUniqueOrThrow({ where: { warrantyCodeId: code.id }, include: { units: true, patient: true } });
    expect(rc.units.map((u) => u.toothNumber).sort()).toEqual([11, 12, 21, 22]);
    expect(rc.patient.phoneEnc).not.toContain("0901"); // encrypted at rest
    const audit = await prisma.auditLog.findFirst({ where: { action: "warranty.activate", entityId: code.id } });
    expect(audit?.actorId).toBe(ctx.labAUser.userId);
  });

  it("7. Lab B cannot activate Lab A's code (and cannot tell it exists)", async () => {
    const { code } = await assignedCode();
    await expectAppError(activateWarranty(ctx.labBUser, code.code, activationInput()), "FORBIDDEN", "NOT_ASSIGNED");
    await expectAppError(getWarrantyDetail(ctx.labBUser, code.code), "NOT_FOUND");
  });

  it("8. expiration date follows the policy (120 months from installation)", async () => {
    const { code } = await assignedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput());
    expect(r.warrantyStartDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(r.warrantyEndDate?.toISOString().slice(0, 10)).toBe("2036-10-05");
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("ACTIVE");
    expect(pub!.validity).toBe("ACTIVE");
    expect(pub!.warrantyEndDate?.slice(0, 10)).toBe("2036-10-05");
  });

  it("9. duplicate activation is rejected", async () => {
    const { code } = await assignedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    await expectAppError(activateWarranty(ctx.labAUser, code.code, activationInput()), "CONFLICT", "ALREADY_ACTIVATED");
    expect(await prisma.restorationCase.count({ where: { warrantyCodeId: code.id } })).toBe(1);
  });

  it("10. two simultaneous activations cannot both succeed", async () => {
    const { code } = await assignedCode();
    const second = await makeUser("LAB_ADMIN", { laboratoryId: ctx.labA.id });
    const results = await Promise.allSettled([
      activateWarranty(ctx.labAUser, code.code, activationInput()),
      activateWarranty(second, code.code, activationInput()),
      activateWarranty(ctx.labAUser, code.code, activationInput()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.warrantyActivation.count({ where: { warrantyCodeId: code.id } })).toBe(1);
    expect(await prisma.patient.count()).toBe(1); // losers rolled back fully
  });

  it("rejects duplicate teeth and unknown FDI numbers at validation", () => {
    const base = activationInput();
    const dup = { ...base, restoration: { ...base.restoration, teeth: [{ toothNumber: 11 }, { toothNumber: 11 }] } };
    expect(activationSchema.safeParse(JSON.parse(JSON.stringify(dup))).success).toBe(false);
    const bad = { ...base, restoration: { ...base.restoration, teeth: [{ toothNumber: 19 }] } };
    expect(activationSchema.safeParse(JSON.parse(JSON.stringify(bad))).success).toBe(false);
  });

  it("unknown installation date → pending confirmation, then confirmed", async () => {
    const { code } = await assignedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput({ installationDate: null }));
    expect(r.installationStatus).toBe("PENDING_CONFIRMATION");
    expect(r.warrantyEndDate).toBeNull();
    expect((await getPublicPassport(code.code))!.state).toBe("PENDING_INSTALLATION");
    await confirmInstallation(ctx.labAUser, code.code, new Date("2026-10-10T00:00:00Z"));
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("ACTIVE");
    expect(pub!.warrantyEndDate?.slice(0, 10)).toBe("2036-10-10");
  });
});

describe("validity & revocation", () => {
  it("11. expired warranties display as EXPIRED", async () => {
    await prisma.warrantyPolicy.update({ where: { id: ctx.policy.id }, data: { durationMonths: 1 } });
    const { code } = await assignedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput({ completionDate: new Date("2024-01-01T00:00:00Z"), installationDate: new Date("2024-01-10T00:00:00Z") }));
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("EXPIRED");
    expect(pub!.validity).toBe("EXPIRED");
    expect(pub!.warrantyEndDate?.slice(0, 10)).toBe("2024-02-10");
    // Expired is still an activated code, not an unactivated one
    expect((await prisma.warrantyCode.findUniqueOrThrow({ where: { id: code.id } })).activationStatus).toBe("ACTIVATED");
  });

  it("12. revoked warranties display as REVOKED and cannot be activated", async () => {
    const { code } = await assignedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    await revokeCode(ctx.admin, code.code, "Thẻ bị sao chép");
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("REVOKED");
    expect(pub!.validity).toBeNull();
    expect(pub!.activatedAt).toBeNull();

    const { batch } = await assignedCode();
    const other = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id } });
    await revokeCode(ctx.admin, other.code, "Mất thẻ");
    await expectAppError(activateWarranty(ctx.labAUser, other.code, activationInput()), "CONFLICT", "REVOKED");
  });
});

describe("privacy", () => {
  it("13. public data has no patient info; private data requires verification", async () => {
    const { code } = await assignedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput());
    const pub = JSON.stringify(await getPublicPassport(code.code));
    for (const secret of ["Nguyễn Văn A", "0901", "Nha khoa Sài Gòn", "Trần B", '"teeth"', "LOT-2026-09"]) expect(pub).not.toContain(secret);

    expect(await readPatientAccessToken(undefined, code.code)).toBe(false);
    await expectAppError(verifyPatientAccess(code.code, "ACCESS_CODE", "AAAA-AAAA"), "BAD_REQUEST");
    await expectAppError(verifyPatientAccess(code.code, "PHONE_NUMBER", "0999999999"), "BAD_REQUEST");

    const viaPhone = await verifyPatientAccess(code.code, "PHONE_NUMBER", "+84 901 234 567");
    expect(await readPatientAccessToken(viaPhone.token, code.code)).toBe(true);
    const ok = await verifyPatientAccess(code.code, "ACCESS_CODE", r.accessCode.toLowerCase());
    expect(await readPatientAccessToken(ok.token, code.code)).toBe(true);
    // token is bound to this code only
    const { batch } = await assignedCode();
    const other = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id } });
    expect(await readPatientAccessToken(ok.token, other.code)).toBe(false);

    const priv = await getPrivatePassport(code.code);
    expect(priv.patientName).toBe("Nguyễn Văn A");
    expect(priv.teeth.map((t) => t.toothNumber)).toEqual([11, 12, 21, 22]);
  });

  it("verification is locked after 5 failed attempts", async () => {
    const { code } = await assignedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput());
    for (let i = 0; i < 5; i++) await expectAppError(verifyPatientAccess(code.code, "ACCESS_CODE", "XXXX-XXXX"), "BAD_REQUEST");
    await expectAppError(verifyPatientAccess(code.code, "ACCESS_CODE", r.accessCode), "RATE_LIMITED");
  });

  it("brand admins cannot see patient identity; lab users only see their lab", async () => {
    const { code } = await assignedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    const brandAdmin = { ...(await makeUser("BRAND_ADMIN")), brandIds: [ctx.brand.id] };
    const d = await getWarrantyDetail(brandAdmin, code.code);
    expect(d.case?.patient).toBeNull();
    expect(d.case?.accessCode).toBeNull();
    const otherBrandAdmin = { ...(await makeUser("BRAND_ADMIN")), brandIds: [] };
    await expectAppError(getWarrantyDetail(otherBrandAdmin, code.code), "FORBIDDEN");
  });
});

describe("certificates & policies", () => {
  it("14. PDF certificate contains the correct data (Vietnamese text)", async () => {
    const { code } = await assignedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput());
    const { pdf } = await certificatePdf(code.code, { actor: ctx.labAUser });
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    expect(text).toContain(code.code);
    expect(text).toContain("Origin Beyond Plus");
    expect(text).toContain("CHỨNG NHẬN BẢO HÀNH PHỤC HÌNH CHÍNH HÃNG");
    expect(text).toContain("Nguyễn Văn A");
    expect(text).toContain("11, 12, 21, 22");
    expect(text).toContain("04/10/2036"); // last covered day
    expect(text).toContain(r.accessCode);

    const publicPdf = await certificatePdf(code.code, {});
    const publicText = (await extractText(await getDocumentProxy(new Uint8Array(publicPdf.pdf)), { mergePages: true })).text;
    expect(publicText).toContain(code.code);
    expect(publicText).not.toContain("Nguyễn Văn A");
    expect(publicText).not.toContain(r.accessCode);
  });

  it("15. existing warranties keep their original policy version", async () => {
    const { code, batch } = await assignedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    const v2 = await publishPolicyVersion(ctx.admin, ctx.product.id, { durationMonths: 60, startRule: "INSTALLATION_DATE", conditions: "Điều kiện v2", exclusions: null, claimInstructions: null, careInstructions: null, benefits: null });
    expect(v2.version).toBe(2);

    const old = await getPublicPassport(code.code);
    expect(old!.durationMonths).toBe(120);
    expect(old!.policy!.version).toBe(1);
    expect(old!.policy!.conditions).toBe("Điều kiện v1");
    expect(old!.warrantyEndDate?.slice(0, 10)).toBe("2036-10-05");

    const next = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id, activationStatus: "NOT_ACTIVATED" }, orderBy: { serial: "asc" } });
    const r2 = await activateWarranty(ctx.labAUser, next.code, activationInput());
    expect(r2.durationMonths).toBe(60);
    expect(r2.warrantyEndDate?.toISOString().slice(0, 10)).toBe("2031-10-05");
  });
});

describe("claims", () => {
  it("claims start SUBMITTED, are never auto-approved, and follow allowed transitions", async () => {
    const { code } = await assignedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    const claim = await submitClaim(null, code.code, { claimantType: "PATIENT", claimantName: "Nguyễn Văn A", contactPhone: null, contactEmail: null, description: "Mẻ sứ răng 11" });
    expect(claim.status).toBe("SUBMITTED");
    await expectAppError(updateClaimStatus(ctx.admin, claim.id, "COMPLETED", null), "CONFLICT");
    await updateClaimStatus(ctx.admin, claim.id, "UNDER_REVIEW", null);
    await updateClaimStatus(ctx.admin, claim.id, "APPROVED", "OK");
    const events = await prisma.warrantyClaimEvent.findMany({ where: { claimId: claim.id } });
    expect(events.map((e) => e.toStatus)).toEqual(["SUBMITTED", "UNDER_REVIEW", "APPROVED"]);
  });
});

describe("assignment rules", () => {
  it("cannot assign codes to a lab not authorized for the brand, nor re-assign activated codes", async () => {
    const lonely = await prisma.laboratory.create({ data: { code: "LAB-0099", name: "Labo C" } });
    const batch = await batchOf(3);
    await expectAppError(assignCodes(ctx.admin, { laboratoryId: lonely.id, batchId: batch.id, quantity: 1, note: null }), "CONFLICT");
    await assignCodes(ctx.admin, { laboratoryId: ctx.labA.id, batchId: batch.id, serialFrom: 1, serialTo: 2, note: null });
    const first = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id, serial: 1 } });
    await activateWarranty(ctx.labAUser, first.code, activationInput());
    await expectAppError(assignCodes(ctx.admin, { laboratoryId: ctx.labB.id, codes: [first.code], note: null }), "CONFLICT");
    // unassigned count reflects the range assignment
    expect(await prisma.warrantyCode.count({ where: { batchId: batch.id, assignmentStatus: "UNASSIGNED" } })).toBe(1);
  });
});
