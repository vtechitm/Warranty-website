import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { createAndGenerateBatch } from "@/server/services/warranty-codes";
import { activateWarranty } from "@/server/services/activation";
import { confirmUnitImport, parseUnitSheet, previewUnitImport } from "@/server/services/unit-import";
import { parseCsv } from "@/server/tabular";
import { listUnitBalances } from "@/server/services/units";
import { getClaimImage, sniffImageType, validateClaimImages } from "@/server/services/claim-images";
import { listClaims, submitClaim } from "@/server/services/claims";
import { readPatientAccessToken, requestPatientOtp, verifyPatientAccess } from "@/server/services/passport";
import { LocalStorage, S3Storage, setStorage } from "@/server/storage";
import { ConsoleOtpProvider, setOtpProvider } from "@/server/otp";
import JSZip from "jszip";
import { exportBatchPrintPackage, exportBatchXlsx, exportWarrantiesXlsx, qrFileName } from "@/server/services/exports";
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

describe("Excel / CSV tooth-unit import", () => {
  it("parses CSV with quotes, BOM, semicolons and Vietnamese headers", () => {
    expect(parseCsv("\uFEFFa;" + '"b;c"' + "\r\n" + '"x ""y""";z' + "\n")).toEqual([["a", "b;c"], ['x "y"', "z"]]);
  });

  it("previews without writing, reports every problem, then allocates all rows in one go", async () => {
    const lonely = await prisma.laboratory.create({ data: { code: "LAB-0003", name: "Labo C" } });
    const csv = [
      "Mã labo,Mã phôi,Số đơn vị,Số hoá đơn",
      "LAB-0001,OBP,50,HD-1",
      "lab-0002,obp,1.000,HD-2",
      "LAB-0001,OBP,20,HD-3",
      "LAB-9999,OBP,5,HD-4",
      "LAB-0001,XXX,5,HD-5",
      "LAB-0001,OBP,-3,HD-6",
      `${lonely.code},OBP,5,HD-7`,
    ].join("\n");
    const rows = await parseUnitSheet(Buffer.from(csv), "units.csv");
    expect(rows).toHaveLength(7);
    const preview = await previewUnitImport(ctx.admin, rows);
    expect(preview.summary).toMatchObject({ total: 7, valid: 3, invalid: 4, units: 1070 });
    expect(preview.rows.map((r) => r.error)).toEqual([null, null, null, "Labo LAB-9999 không tồn tại", "Không có phôi mã XXX", "Số đơn vị phải là số nguyên dương", "Labo chưa được ủy quyền cho thương hiệu của phôi này"]);
    expect(preview.rows.map((r) => r.balanceAfter).slice(0, 3)).toEqual([150, 1100, 170]); // running balances (100 from the test seed)

    await expectAppError(confirmUnitImport(ctx.admin, rows, null, "units.csv"), "VALIDATION_ERROR");
    expect((await listUnitBalances(ctx.admin, { laboratoryId: ctx.labA.id }))[0].balance).toBe(100); // nothing written

    const r = await confirmUnitImport(ctx.admin, rows.slice(0, 3), null, "units.csv");
    expect(r).toEqual({ rows: 3, units: 1070 });
    expect((await listUnitBalances(ctx.admin, { laboratoryId: ctx.labA.id }))[0].balance).toBe(170);
    expect((await listUnitBalances(ctx.admin, { laboratoryId: ctx.labB.id }))[0].balance).toBe(1100);
    expect(await prisma.unitLedgerEntry.count({ where: { reference: { in: ["HD-1", "HD-2", "HD-3"] } } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "units.import" } })).toBe(1);
  });

  it("reads .xlsx without headers; non-admins are refused", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRows([["LAB-0001", "OBP", 10, "HD-9"]]);
    const rows = await parseUnitSheet(Buffer.from(await wb.xlsx.writeBuffer()), "units.xlsx");
    expect(rows).toEqual([{ row: 1, labCode: "LAB-0001", sku: "OBP", brandPrefix: null, units: "10", reference: "HD-9" }]);
    expect((await previewUnitImport(ctx.admin, rows)).summary.valid).toBe(1);
    await expectAppError(previewUnitImport(ctx.labAUser, rows), "FORBIDDEN");
    await expectAppError(parseUnitSheet(Buffer.from("PK-not-really"), "x.xlsx"), "BAD_REQUEST", "INVALID_FILE");
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

  // The claims feature has no HTTP/UI entry points any more (traceability model); the service layer is kept intact.
  it("stores claim photos privately; only authorized viewers can fetch them (service layer)", async () => {
    const { code } = await activeCode();
    const images = await validateClaimImages([file("a.png", PNG, "image/png"), file("b.jpg", JPEG, "image/jpeg")]);
    const claim = await submitClaim(null, code, { claimantType: "PATIENT", claimantName: "Nguyễn Văn A", contactPhone: "0901234567", contactEmail: null, description: "Mẻ sứ răng 11 khi ăn" }, images);
    expect(claim.imageUrls).toHaveLength(2);

    const { items } = await listClaims(ctx.admin, { page: 1, pageSize: 10 });
    expect(items[0].images).toHaveLength(2);
    expect(items[0]).not.toHaveProperty("imageUrls");
    const url = items[0].images[0];
    const [, , , , claimId, , name] = url.split("/");

    expect((await getClaimImage(claimId, name, { actor: ctx.admin, patientCode: null })).contentType).toBe("image/png");
    expect((await getClaimImage(claimId, name, { actor: ctx.labAUser, patientCode: null })).body.equals(PNG)).toBe(true);
    expect((await getClaimImage(claimId, name, { actor: null, patientCode: code })).contentType).toBe("image/png");
    await expectAppError(getClaimImage(claimId, name, { actor: ctx.labBUser, patientCode: null }), "NOT_FOUND");
    await expectAppError(getClaimImage(claimId, name, { actor: null, patientCode: "ORG26-AAAAAAAA" }), "NOT_FOUND");
    await expectAppError(getClaimImage(claimId, "../../etc.png", { actor: ctx.admin, patientCode: null }), "NOT_FOUND");
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

describe("print exports", () => {
  it("batch Excel embeds one QR picture per code next to its URL and file name", async () => {
    const codes = await codesOf(3);
    const batchId = codes[0].batchId;
    const { buffer } = await exportBatchXlsx(ctx.admin, batchId);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(["Mã bảo hành", "Ảnh QR", "Nội dung QR (URL)", "Tên file ảnh QR"]));
    expect(ws.getImages()).toHaveLength(3);
    expect(ws.getRow(2).getCell(2).text).toBe(codes[0].code);
    expect(ws.getRow(2).getCell(4).text).toMatch(new RegExp(`/w/${codes[0].code}$`));
    expect(ws.getRow(2).getCell(5).text).toBe(qrFileName(1, codes[0].code, "png"));

    const list = await exportWarrantiesXlsx(ctx.admin, { page: 1, pageSize: 25, batchId });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(list.buffer as unknown as ArrayBuffer);
    expect(wb2.worksheets[0].getImages()).toHaveLength(3);
  });

  it("print package contains Excel, data-merge CSV, PNG + SVG per code and instructions", async () => {
    const codes = await codesOf(4);
    const { buffer, filename } = await exportBatchPrintPackage(ctx.admin, codes[0].batchId, { serialFrom: 2, serialTo: 3 });
    expect(filename).toMatch(/_goi-in_2-3\.zip$/);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual([
      "HUONG-DAN-NHA-IN.txt",
      `QR_PNG/${qrFileName(2, codes[1].code, "png")}`,
      `QR_PNG/${qrFileName(3, codes[2].code, "png")}`,
      `QR_SVG/${qrFileName(2, codes[1].code, "svg")}`,
      `QR_SVG/${qrFileName(3, codes[2].code, "svg")}`,
      "du-lieu-in.csv",
      "du-lieu-in.xlsx",
    ].sort());
    const csv = (await zip.file("du-lieu-in.csv")!.async("string")).replace(/^\uFEFF/, "").split("\r\n");
    expect(csv[0]).toBe("serial,ma_bao_hanh,noi_dung_qr,thuong_hieu,san_pham,@anh_qr,@anh_qr_svg");
    expect(csv[1].split(",").slice(0, 2)).toEqual(["2", codes[1].code]);
    expect(csv[1]).toContain(`QR_PNG/${qrFileName(2, codes[1].code, "png")}`);
    const png = await zip.file(`QR_PNG/${qrFileName(2, codes[1].code, "png")}`)!.async("nodebuffer");
    expect(sniffImageType(png)).toBe("image/png");
    await expectAppError(exportBatchPrintPackage(ctx.labAUser, codes[0].batchId, {}), "FORBIDDEN");
  });
});
