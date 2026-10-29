import { beforeEach, describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma } from "@/server/db";
import { createAndGenerateBatch, reinstateCode, revokeCode, CODE_PATTERN } from "@/server/services/warranty-codes";
import { allocateUnits, listUnitBalances } from "@/server/services/units";
import { activateWarranty, checkCodeForActivation, confirmInstallation, correctWarranty, getWarrantyDetail } from "@/server/services/activation";
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

/** A freshly printed card: cards are not assigned to labs, any authorized lab may activate it. */
async function unusedCode() {
  const batch = await batchOf(5);
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
    expect(codes.every((c) => /^OR\d{8}$/.test(c.code) && CODE_PATTERN.test(c.code))).toBe(true);
    // Digits are random, not sequential: consecutive serials must not be consecutive numbers.
    const nums = codes.slice(0, 50).map((c) => Number(c.code.slice(2)));
    expect(nums.filter((n, i) => i > 0 && Math.abs(n - nums[i - 1]) === 1).length).toBeLessThan(3);
    // Dense, ordered serials for printing
    expect(codes.map((c) => c.serial)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));

    // URL is derived from the batch's frozen base URL — identical before & after activation
    const before = warrantyUrl(batch.qrBaseUrl, codes[0].code);
    expect(before).toBe(`${batch.qrBaseUrl}/w/${codes[0].code}`);
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
    const { code } = await unusedCode();
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

describe("tooth units & activation", () => {
  it("5–6. any authorized lab activates a printed card; the case's teeth are consumed from its units", async () => {
    const { code } = await unusedCode();
    const check = await checkCodeForActivation(ctx.labAUser, code.code);
    expect(check.product.name).toBe("Origin Beyond Plus");
    expect(check.units.available).toBe(100);

    const result = await activateWarranty(ctx.labAUser, code.code, activationInput());
    expect(result.unitCount).toBe(4);
    expect(result.teeth).toEqual([11, 12, 21, 22]);
    expect(result.accessCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const rc = await prisma.restorationCase.findUniqueOrThrow({ where: { warrantyCodeId: code.id }, include: { units: true, patient: true } });
    expect(rc.units.map((u) => u.toothNumber).sort()).toEqual([11, 12, 21, 22]);
    expect(rc.patient.phoneEnc).not.toContain("0901"); // encrypted at rest
    const audit = await prisma.auditLog.findFirst({ where: { action: "warranty.activate", entityId: code.id } });
    expect(audit?.actorId).toBe(ctx.labAUser.userId);

    const [bal] = await listUnitBalances(ctx.labAUser);
    expect(bal).toMatchObject({ balance: 96, allocated: 100, used: 4 });
    expect(result.unitsLeft).toBe(96);
    const entry = await prisma.unitLedgerEntry.findFirstOrThrow({ where: { kind: "ACTIVATION", restorationCaseId: rc.id } });
    expect(entry).toMatchObject({ delta: -4, balanceAfter: 96 });
  });

  it("7. a card activated by Lab A is used: Lab B cannot activate it nor see the record", async () => {
    const { code } = await unusedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    await expectAppError(activateWarranty(ctx.labBUser, code.code, activationInput()), "CONFLICT", "ALREADY_ACTIVATED");
    await expectAppError(getWarrantyDetail(ctx.labBUser, code.code), "NOT_FOUND");
    // Lab B was not charged.
    expect((await listUnitBalances(ctx.labBUser))[0].balance).toBe(100);
  });

  it("units are required; the optional tooth chart must match; no units left → no activation", async () => {
    // As sent over the API (dates as YYYY-MM-DD strings).
    const r = activationInput();
    const api = (restoration: Record<string, unknown>) => ({ ...r, restoration: { ...r.restoration, completionDate: "2026-10-01", installationDate: "2026-10-05", ...restoration } });
    expect(activationSchema.safeParse(api({})).success).toBe(true);
    expect(activationSchema.safeParse(api({ units: undefined })).success).toBe(false);
    expect(activationSchema.safeParse(api({ units: 3 })).success).toBe(false); // 4 teeth charted
    expect(activationSchema.safeParse(api({ units: 3, teeth: [] })).success).toBe(true);
    expect(activationSchema.safeParse(api({ units: 0, teeth: [] })).success).toBe(false);

    const { batch } = await unusedCode();
    const codes = await prisma.warrantyCode.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" } });
    // Without a chart: only the count is recorded.
    const noChart = await activateWarranty(ctx.labAUser, codes[0].code, activationInput({ units: 2, teeth: [] }));
    expect(noChart.unitCount).toBe(2);
    expect(await prisma.restorationUnit.count({ where: { restorationCase: { warrantyCodeId: codes[0].id } } })).toBe(0);

    // Drain the balance to 3 → a 4-tooth case is refused and nothing is saved.
    await allocateUnits(ctx.admin, { laboratoryId: ctx.labA.id, productId: ctx.product.id, units: -95, kind: "ADJUSTMENT", reference: null, note: "test" });
    await expectAppError(activateWarranty(ctx.labAUser, codes[1].code, activationInput()), "CONFLICT", "INSUFFICIENT_UNITS");
    expect((await prisma.warrantyCode.findUniqueOrThrow({ where: { id: codes[1].id } })).activationStatus).toBe("NOT_ACTIVATED");
    expect(await prisma.restorationCase.count({ where: { warrantyCodeId: codes[1].id } })).toBe(0);
    await activateWarranty(ctx.labAUser, codes[1].code, activationInput({ units: 3, teeth: [] }));
    await expectAppError(checkCodeForActivation(ctx.labAUser, codes[2].code), "CONFLICT", "INSUFFICIENT_UNITS");
    // Adjustments can never push a balance below zero.
    await expectAppError(allocateUnits(ctx.admin, { laboratoryId: ctx.labA.id, productId: ctx.product.id, units: -1, kind: "ADJUSTMENT", reference: null, note: null }), "CONFLICT", "INSUFFICIENT_UNITS");
  });

  it("a lab without units for the product, or not authorized for the brand, cannot activate", async () => {
    const lonely = await prisma.laboratory.create({ data: { code: "LAB-0099", name: "Labo C", brands: { create: [{ brandId: ctx.brand.id }] } } });
    const lonelyUser = await makeUser("LAB_STAFF", { laboratoryId: lonely.id });
    const { code } = await unusedCode();
    await expectAppError(checkCodeForActivation(lonelyUser, code.code), "CONFLICT", "INSUFFICIENT_UNITS");
    const outsider = await prisma.laboratory.create({ data: { code: "LAB-0098", name: "Labo D" } });
    await expectAppError(allocateUnits(ctx.admin, { laboratoryId: outsider.id, productId: ctx.product.id, units: 10, kind: "ALLOCATION", reference: null, note: null }), "CONFLICT");
    const outsiderUser = await makeUser("LAB_STAFF", { laboratoryId: outsider.id });
    await expectAppError(checkCodeForActivation(outsiderUser, code.code), "FORBIDDEN", "BRAND_NOT_AUTHORIZED");
    await expectAppError(allocateUnits(ctx.labAUser, { laboratoryId: ctx.labA.id, productId: ctx.product.id, units: 10, kind: "ALLOCATION", reference: null, note: null }), "FORBIDDEN");
  });

  it("revocation refunds the units, reinstatement takes them again; unit corrections settle the difference", async () => {
    const { code } = await unusedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    const bal = async () => (await listUnitBalances(ctx.labAUser))[0].balance;
    expect(await bal()).toBe(96);
    await revokeCode(ctx.admin, code.code, "Thẻ phát hành sai");
    expect(await bal()).toBe(100);
    await revokeCode(ctx.admin, code.code, "again").catch(() => null); // already revoked: no double refund
    expect(await bal()).toBe(100);
    await reinstateCode(ctx.admin, code.code, "Phát hành lại");
    expect(await bal()).toBe(96);

    const labAdmin = await makeUser("LAB_ADMIN", { laboratoryId: ctx.labA.id });
    const { code: c2 } = await unusedCode();
    await activateWarranty(ctx.labAUser, c2.code, activationInput({ units: 2, teeth: [] }));
    expect(await bal()).toBe(94);
    await correctWarranty(labAdmin, c2.code, { units: 5, reason: "Nhập thiếu" });
    expect(await bal()).toBe(91);
    await correctWarranty(labAdmin, c2.code, { units: 1, reason: "Nhập thừa" });
    expect(await bal()).toBe(95);
    // A charted case must keep chart and count in step.
    await expectAppError(correctWarranty(labAdmin, code.code, { units: 2, reason: "x" }), "VALIDATION_ERROR");
    const kinds = (await prisma.unitLedgerEntry.findMany({ where: { laboratoryId: ctx.labA.id }, orderBy: { createdAt: "asc" } })).map((e) => `${e.kind}:${e.delta}`);
    expect(kinds).toEqual(["ALLOCATION:100", "ACTIVATION:-4", "REFUND:4", "ACTIVATION:-4", "ACTIVATION:-2", "ACTIVATION:-3", "REFUND:4"]);
  });

  it("concurrent activations never overspend the balance", async () => {
    await allocateUnits(ctx.admin, { laboratoryId: ctx.labA.id, productId: ctx.product.id, units: -92, kind: "ADJUSTMENT", reference: null, note: "leave 8" });
    const { batch } = await unusedCode();
    const codes = await prisma.warrantyCode.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" }, take: 3 });
    // 3 × 4 teeth = 12 requested, only 8 available → exactly two succeed.
    const results = await Promise.allSettled(codes.map((c) => activateWarranty(ctx.labAUser, c.code, activationInput())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await listUnitBalances(ctx.labAUser))[0].balance).toBe(0);
  });

  it("8. expiration date follows the lab's warranty (120 months from installation)", async () => {
    const { code } = await unusedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput({ warrantyMonths: 120 }));
    expect(r.warrantyStartDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(r.warrantyEndDate?.toISOString().slice(0, 10)).toBe("2036-10-05");
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("ACTIVE");
    expect(pub!.validity).toBe("ACTIVE");
    expect(pub!.warrantyEndDate?.slice(0, 10)).toBe("2036-10-05");
  });

  it("9. duplicate activation is rejected", async () => {
    const { code } = await unusedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    await expectAppError(activateWarranty(ctx.labAUser, code.code, activationInput()), "CONFLICT", "ALREADY_ACTIVATED");
    expect(await prisma.restorationCase.count({ where: { warrantyCodeId: code.id } })).toBe(1);
  });

  it("10. two simultaneous activations cannot both succeed", async () => {
    const { code } = await unusedCode();
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
    const { code } = await unusedCode();
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
    const { code } = await unusedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput({ warrantyMonths: 1, completionDate: new Date("2024-01-01T00:00:00Z"), installationDate: new Date("2024-01-10T00:00:00Z") }));
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("EXPIRED");
    expect(pub!.validity).toBe("EXPIRED");
    expect(pub!.warrantyEndDate?.slice(0, 10)).toBe("2024-02-10");
    // Expired is still an activated code, not an unactivated one
    expect((await prisma.warrantyCode.findUniqueOrThrow({ where: { id: code.id } })).activationStatus).toBe("ACTIVATED");
  });

  it("12. revoked warranties display as REVOKED and cannot be activated", async () => {
    const { code } = await unusedCode();
    await activateWarranty(ctx.labAUser, code.code, activationInput());
    await revokeCode(ctx.admin, code.code, "Thẻ bị sao chép");
    const pub = await getPublicPassport(code.code);
    expect(pub!.state).toBe("REVOKED");
    expect(pub!.validity).toBeNull();
    expect(pub!.activatedAt).toBeNull();

    const { batch } = await unusedCode();
    const other = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id } });
    await revokeCode(ctx.admin, other.code, "Mất thẻ");
    await expectAppError(activateWarranty(ctx.labAUser, other.code, activationInput()), "CONFLICT", "REVOKED");
  });
});

describe("privacy", () => {
  it("13. public data has no patient info; private data requires verification", async () => {
    const { code } = await unusedCode();
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
    const { batch } = await unusedCode();
    const other = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id } });
    expect(await readPatientAccessToken(ok.token, other.code)).toBe(false);

    const priv = await getPrivatePassport(code.code);
    expect(priv.patientName).toBe("Nguyễn Văn A");
    expect(priv.teeth.map((t) => t.toothNumber)).toEqual([11, 12, 21, 22]);
  });

  it("verification is locked after 5 failed attempts", async () => {
    const { code } = await unusedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput());
    for (let i = 0; i < 5; i++) await expectAppError(verifyPatientAccess(code.code, "ACCESS_CODE", "XXXX-XXXX"), "BAD_REQUEST");
    await expectAppError(verifyPatientAccess(code.code, "ACCESS_CODE", r.accessCode), "RATE_LIMITED");
  });

  it("brand admins cannot see patient identity; lab users only see their lab", async () => {
    const { code } = await unusedCode();
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
    const { code } = await unusedCode();
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput());
    const { pdf } = await certificatePdf(code.code, { actor: ctx.labAUser });
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    expect(text).toContain(code.code);
    expect(text).toContain("Origin Beyond Plus");
    expect(text).toContain("CHỨNG NHẬN NGUỒN GỐC XUẤT XỨ");
    expect(text).toContain("BẢO HÀNH DO LABO CUNG CẤP");
    expect(text).toContain("10 năm");
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

  it("15. the lab sets the warranty; Vtech's figure is only a suggestion and its old terms never apply", async () => {
    const { code, batch } = await unusedCode();
    const checked = await checkCodeForActivation(ctx.labAUser, code.code);
    expect(checked.policy.suggestedMonths).toBe(120);
    const r = await activateWarranty(ctx.labAUser, code.code, activationInput({ warrantyMonths: 36 }));
    expect(r.durationMonths).toBe(36);
    expect(r.warrantyEndDate?.toISOString().slice(0, 10)).toBe("2029-10-05");
    const pub = await getPublicPassport(code.code);
    expect(pub!.durationMonths).toBe(36);
    expect(pub!.policy!.conditions).toBeNull(); // Vtech's former warranty terms are not attached
    const rc = await prisma.restorationCase.findFirstOrThrow({ where: { warrantyCode: { code: code.code } } });
    expect(rc.policySnapshot).toMatchObject({ durationMonths: 36, provider: "LABORATORY", suggestedMonths: 120 });

    // Updating the product information later does not touch activated records.
    const v2 = await publishPolicyVersion(ctx.admin, ctx.product.id, { durationMonths: 60, startRule: "INSTALLATION_DATE", conditions: null, exclusions: null, claimInstructions: null, careInstructions: "Chăm sóc v2", benefits: null });
    expect(v2.version).toBe(2);
    expect((await getPublicPassport(code.code))!.durationMonths).toBe(36);
    const next = await prisma.warrantyCode.findFirstOrThrow({ where: { batchId: batch.id, activationStatus: "NOT_ACTIVATED" }, orderBy: { serial: "asc" } });
    expect((await checkCodeForActivation(ctx.labAUser, next.code)).policy.suggestedMonths).toBe(60);

    // Unactivated codes show no warranty duration (it is not set until a lab activates the code).
    expect((await getPublicPassport(next.code))!.durationMonths).toBeNull();

    // The lab can correct the duration; the end date follows and the change is audited.
    const labAdmin = await makeUser("LAB_ADMIN", { laboratoryId: ctx.labA.id });
    await correctWarranty(labAdmin, code.code, { warrantyMonths: 60, reason: "Nhập nhầm thời hạn" });
    const corrected = await getPublicPassport(code.code);
    expect(corrected!.durationMonths).toBe(60);
    expect(corrected!.warrantyEndDate?.slice(0, 10)).toBe("2031-10-05");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "warranty.correct" } });
    expect(log.metadata).toMatchObject({ before: { warrantyMonths: 36 }, changedFields: ["warrantyMonths"] });

    // Duration is mandatory and bounded.
    const asSent = (warrantyMonths: number) => ({ ...activationInput(), restoration: { ...activationInput().restoration, completionDate: "2026-10-01", installationDate: "2026-10-05", warrantyMonths } });
    expect(activationSchema.safeParse(asSent(120)).success).toBe(true);
    expect(activationSchema.safeParse(asSent(0)).success).toBe(false);
    expect(activationSchema.safeParse(asSent(601)).success).toBe(false);
  });
});

describe("claims", () => {
  it("claims start SUBMITTED, are never auto-approved, and follow allowed transitions", async () => {
    const { code } = await unusedCode();
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


