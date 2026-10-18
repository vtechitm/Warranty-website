import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { createAndGenerateBatch, assignCodes } from "@/server/services/warranty-codes";
import { activateWarranty } from "@/server/services/activation";
import { confirmAssignmentImport, parseAssignmentSheet, parseCsv, previewAssignmentImport } from "@/server/services/assignment-import";
import { getClaimImage, sniffImageType, validateClaimImages } from "@/server/services/claim-images";
import { listClaims, submitClaim } from "@/server/services/claims";
import { readPatientAccessToken, requestPatientOtp, verifyPatientAccess } from "@/server/services/passport";
import { LocalStorage, S3Storage, setStorage } from "@/server/storage";
import { ConsoleOtpProvider, setOtpProvider } from "@/server/otp";
import { POST as passportClaimRoute } from "@/app/api/v1/passports/[code]/claims/route";
import { GET as claimImageRoute } from "@/app/api/v1/claims/[id]/images/[name]/route";
import { activationInput, makeUser, resetDb, seedBasics } from "./helpers";

type Ctx = Awaited<ReturnType<typeof seedBasics>>;
let ctx: Ctx;
const storageDir = mkdtempSync(path.join(tmpdir(), "vtech-storage-"));
const otp = new ConsoleOtpProvider();

async function expectAppError(p: Promise<unknown>, code: AppError["code"], reason?: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).reason).toBe(reason);
  return err as AppError;
}

async function codesOf(quantity: number) {
  const batch = await createAndGenerateBatch(ctx.admin, { productId: ctx.product.id, quantity, notes: null });
  return prisma.warrantyCode.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" } });
}

async function activeCode() {
  const [c] = await codesOf(1);
  await assignCodes(ctx.admin, { laboratoryId: ctx.labA.id, codes: [c.code], note: null });
  const r = await activateWarranty(ctx.labAUser, c.code, activationInput());
  return { code: c.code, accessCode: r.accessCode };
}

// Smallest valid images (signatures only matter for validation).
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d00000000049454e44ae426082", "hex");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64), Buffer.from([0xff, 0xd9])]);
const file = (name: string, body: Buffer, type: string) => new File([new Uint8Array(body)], name, { type });

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  setStorage(new LocalStorage(storageDir));
  otp.outbox.length = 0;
  setOtpProvider(otp);
});

afterAll(() => {
  setStorage(null);
  setOtpProvider(undefined);
  rmSync(storageDir, { recursive: true, force: true });
});

describe("Excel / CSV assignment import", () => {
  it("parses CSV with quotes, BOM, semicolons and Vietnamese headers", () => {
    expect(parseCsv('﻿a;"b;c"\r\n"x ""y""";z\n')).toEqual([["a", "b;c"], ['x "y"', "z"]]);
  });

  it("previews without writing, reports every problem, then assigns per lab on confirm", async () => {
    const codes = await codesOf(4);
    const [used] = await codesOf(1);
    await assignCodes(ctx.admin, { laboratoryId: ctx.labA.id, codes: [used.code], note: null });
    await activateWarranty(ctx.labAUser, used.code, activationInput());
    const csv = [
      "Mã bảo hành,Mã labo",
      `${codes[0].code},LAB-0001`,
      `${codes[1].code.toLowerCase()},lab-0002`,
      `${codes[0].code},LAB-0002`,
      "ORG26-ZZZZZZZZ,LAB-0001",
      "not-a-code,LAB-0001",
      `${codes[2].code},LAB-9999`,
      `${used.code},LAB-0001`,
    ].join("\n");
    const rows = await parseAssignmentSheet(Buffer.from(csv), "assign.csv");
    expect(rows).toHaveLength(7);
    const preview = await previewAssignmentImport(ctx.admin, rows);
    expect(preview.summary).toMatchObject({ total: 7, valid: 2, invalid: 5 });
    expect(preview.rows.map((r) => r.error)).toEqual([null, null, "Trùng với dòng 2", "Mã không tồn tại", "Mã không đúng định dạng", "Labo LAB-9999 không tồn tại", "Mã đã kích hoạt"]);
    expect(await prisma.warrantyCode.count({ where: { assignmentStatus: "ASSIGNED" } })).toBe(1); // only the activated one

    await expectAppError(confirmAssignmentImport(ctx.admin, rows, null), "VALIDATION_ERROR");
    expect(await prisma.warrantyCode.count({ where: { assignmentStatus: "ASSIGNED" } })).toBe(1);

    const good = rows.slice(0, 2);
    const r = await confirmAssignmentImport(ctx.admin, good, null, "assign.csv");
    expect(r.assigned).toBe(2);
    const after = await prisma.warrantyCode.findMany({ where: { id: { in: [codes[0].id, codes[1].id] } }, orderBy: { serial: "asc" } });
    expect(after.map((c) => c.assignedLaboratoryId)).toEqual([ctx.labA.id, ctx.labB.id]);
    expect(await prisma.warrantyAssignment.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "code.import_assign" } })).toBe(1);
  });

  it("reads .xlsx without headers and flags unauthorized brands; non-admins are refused", async () => {
    const [c] = await codesOf(1);
    const lonely = await prisma.laboratory.create({ data: { code: "LAB-0003", name: "Labo C" } });
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRows([[c.code, "LAB-0001"], [c.code, lonely.code]]);
    const rows = await parseAssignmentSheet(Buffer.from(await wb.xlsx.writeBuffer()), "codes.xlsx");
    expect(rows.map((r) => r.labCode)).toEqual(["LAB-0001", "LAB-0003"]);
    const p = await previewAssignmentImport(ctx.admin, [rows[1]]);
    expect(p.rows[0].error).toBe("Labo chưa được ủy quyền cho thương hiệu của mã");
    await expectAppError(previewAssignmentImport(ctx.labAUser, rows), "FORBIDDEN");
    await expectAppError(parseAssignmentSheet(Buffer.from("PK-not-really"), "x.xlsx"), "BAD_REQUEST", "INVALID_FILE");
  });
});

describe("claim photos", () => {
  it("validates real content, size and count", async () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(await validateClaimImages([file("a.png", PNG, "image/png"), file("b.jpg", JPEG, "")])).toHaveLength(2);
    await expectAppError(validateClaimImages([file("evil.png", Buffer.from("<script>alert(1)</script>"), "image/png")]), "BAD_REQUEST", "UNSUPPORTED_IMAGE");
    await expectAppError(validateClaimImages([file("liar.jpg", PNG, "image/jpeg")]), "BAD_REQUEST", "UNSUPPORTED_IMAGE");
    await expectAppError(validateClaimImages(Array.from({ length: 7 }, (_, i) => file(`${i}.png`, PNG, "image/png"))), "BAD_REQUEST", "TOO_MANY_IMAGES");
    const big = Buffer.concat([JPEG, Buffer.alloc(9 * 1024 * 1024)]);
    await expectAppError(validateClaimImages([file("big.jpg", big, "image/jpeg")]), "BAD_REQUEST", "IMAGE_TOO_LARGE");
  });

  it("verified patient uploads photos via multipart; only authorized viewers can fetch them", async () => {
    const { code, accessCode } = await activeCode();
    const { token } = await verifyPatientAccess(code, "ACCESS_CODE", accessCode);
    const fd = new FormData();
    fd.set("claimantName", "Nguyễn Văn A");
    fd.set("contactPhone", "0901234567");
    fd.set("contactEmail", "");
    fd.set("description", "Mẻ sứ răng 11 khi ăn");
    fd.append("images", file("a.png", PNG, "image/png"));
    fd.append("images", file("b.jpg", JPEG, "image/jpeg"));
    const res = await passportClaimRoute(
      new NextRequest(`http://localhost:3000/api/v1/passports/${code}/claims`, { method: "POST", body: fd, headers: { "x-patient-access": token } }),
      { params: Promise.resolve({ code }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.imageCount).toBe(2);

    const { items } = await listClaims(ctx.admin, { page: 1, pageSize: 10 });
    expect(items[0].images).toHaveLength(2);
    expect(items[0]).not.toHaveProperty("imageUrls");
    const url = items[0].images[0];
    const [, , , , claimId, , name] = url.split("/");
    expect(url).toBe(`/api/v1/claims/${claimId}/images/${name}`);

    expect((await getClaimImage(claimId, name, { actor: ctx.admin, patientCode: null })).contentType).toBe("image/png");
    expect((await getClaimImage(claimId, name, { actor: ctx.labAUser, patientCode: null })).body.equals(PNG)).toBe(true);
    await expectAppError(getClaimImage(claimId, name, { actor: ctx.labBUser, patientCode: null }), "NOT_FOUND");
    await expectAppError(getClaimImage(claimId, name, { actor: null, patientCode: "ORG26-AAAAAAAA" }), "NOT_FOUND");
    await expectAppError(getClaimImage(claimId, "../../etc.png", { actor: ctx.admin, patientCode: null }), "NOT_FOUND");

    const anon = await claimImageRoute(new NextRequest(`http://localhost:3000${url}`), { params: Promise.resolve({ id: claimId, name }) });
    expect(anon.status).toBe(404);
    const asPatient = await claimImageRoute(new NextRequest(`http://localhost:3000${url}`, { headers: { "x-patient-access": token } }), { params: Promise.resolve({ id: claimId, name }) });
    expect(asPatient.status).toBe(200);
    expect(asPatient.headers.get("content-type")).toBe("image/png");
  });

  it("removes stored photos if the claim cannot be created", async () => {
    const images = await validateClaimImages([file("a.png", PNG, "image/png")]);
    const store = new LocalStorage(storageDir);
    const puts: string[] = [];
    setStorage({ driver: "local", put: async (k, b) => { puts.push(k); await store.put(k, b); }, get: (k) => store.get(k), delete: (k) => store.delete(k) });
    const { code } = await activeCode();
    await prisma.warrantyCode.update({ where: { code }, data: { revokedAt: new Date() } });
    await expectAppError(submitClaim(null, code, { claimantType: "PATIENT", claimantName: "A", contactPhone: null, contactEmail: null, description: "x" }, images), "CONFLICT");
    expect(puts).toHaveLength(0); // validation failed before upload

    const { code: ok } = await activeCode();
    const lab = await makeUser("LAB_STAFF", { laboratoryId: ctx.labB.id });
    await expectAppError(submitClaim(lab, ok, { claimantType: "LABORATORY", claimantName: "B", contactPhone: null, contactEmail: null, description: "x" }, images), "NOT_FOUND");
    const c = await submitClaim(null, ok, { claimantType: "PATIENT", claimantName: "A", contactPhone: null, contactEmail: null, description: "x" }, images);
    expect(c.imageUrls).toEqual(puts);
    expect(await store.get(puts[0])).not.toBeNull();
  });

  it("S3 driver signs path-style requests", async () => {
    const calls: Request[] = [];
    const s3 = new S3Storage(
      { endpoint: "https://s3.example.com", region: "auto", bucket: "claims", accessKeyId: "AK", secretAccessKey: "SK", forcePathStyle: true },
      (async (req: Request) => { calls.push(req); return new Response(null, { status: req.method === "GET" ? 404 : 200 }); }) as typeof fetch,
    );
    await s3.put("claims/2026/10/a.png", PNG, "image/png");
    expect(await s3.get("claims/2026/10/a.png")).toBeNull();
    expect(calls[0].url).toBe("https://s3.example.com/claims/claims/2026/10/a.png");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request/);
    expect(() => s3.url("../secret")).toThrow();
  });
});

describe("phone OTP verification", () => {
  it("sends a code only to the registered phone and verifies once", async () => {
    const { code } = await activeCode();
    await expectAppError(requestPatientOtp(code, "0999999999"), "BAD_REQUEST");
    expect(otp.outbox).toHaveLength(0);

    const sent = await requestPatientOtp(code, "+84 901 234 567");
    expect(sent.maskedPhone.endsWith("567")).toBe(true);
    expect(sent.maskedPhone).not.toContain("0901");
    expect(otp.outbox).toHaveLength(1);
    expect(otp.outbox[0].phone).toBe("0901234567");
    const value = otp.outbox[0].code;
    expect(value).toMatch(/^\d{6}$/);
    const stored = await prisma.patientOtpChallenge.findFirstOrThrow();
    expect(stored.codeHash).not.toContain(value);

    await expectAppError(verifyPatientAccess(code, "PHONE_OTP", value === "000000" ? "111111" : "000000"), "BAD_REQUEST");
    const ok = await verifyPatientAccess(code, "PHONE_OTP", value);
    expect(await readPatientAccessToken(ok.token, code)).toBe(true);
    await expectAppError(verifyPatientAccess(code, "PHONE_OTP", value), "BAD_REQUEST", "OTP_EXPIRED"); // single use
    const methods = await prisma.patientAccessVerification.findMany({ orderBy: { createdAt: "asc" }, select: { method: true, success: true } });
    expect(methods).toEqual([
      { method: "PHONE_OTP", success: false },
      { method: "PHONE_OTP", success: false },
      { method: "PHONE_OTP", success: true },
    ]);
  });

  it("enforces resend cooldown, send cap and the shared failure lockout", async () => {
    const { code, accessCode } = await activeCode();
    await requestPatientOtp(code, "0901234567");
    const cool = await expectAppError(requestPatientOtp(code, "0901234567"), "RATE_LIMITED");
    expect((cool.details as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);

    // Age earlier challenges past the cooldown to hit the per-window send cap.
    for (let i = 0; i < 2; i++) {
      await prisma.patientOtpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
      await requestPatientOtp(code, "0901234567");
    }
    await prisma.patientOtpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
    await expectAppError(requestPatientOtp(code, "0901234567"), "RATE_LIMITED");

    // A newer code invalidates older ones.
    expect(await prisma.patientOtpChallenge.count({ where: { consumedAt: null, expiresAt: { gt: new Date() } } })).toBe(1);

    for (let i = 0; i < 5; i++) await expectAppError(verifyPatientAccess(code, "PHONE_OTP", "12345a"), "BAD_REQUEST");
    await expectAppError(verifyPatientAccess(code, "ACCESS_CODE", accessCode), "RATE_LIMITED");
  });

  it("is unavailable when no provider is configured", async () => {
    setOtpProvider(null);
    const { code } = await activeCode();
    await expectAppError(requestPatientOtp(code, "0901234567"), "BAD_REQUEST", "OTP_UNAVAILABLE");
  });
});
