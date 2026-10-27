/**
 * Demo seed: brands, products + policies, two labs, a generated batch, assignments and sample activations
 * covering every public state (active, pending installation, expired, revoked, not activated).
 *
 *   npm run db:seed
 *
 * Passwords come from SEED_ADMIN_PASSWORD / SEED_LAB_PASSWORD. Refuses to run in production.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/crypto";
import type { Actor } from "../src/server/auth/permissions";
import { createAndGenerateBatch, assignCodes, revokeCode } from "../src/server/services/warranty-codes";
import { activateWarranty } from "../src/server/services/activation";

const prisma = new PrismaClient();

const CARE = [
  "Chải răng 2 lần/ngày với bàn chải lông mềm, kem đánh răng không chứa hạt mài.",
  "Làm sạch kẽ răng bằng chỉ nha khoa hoặc tăm nước mỗi ngày.",
  "Không cắn vật cứng như đá lạnh, xương, vỏ cua; không dùng răng mở nắp chai.",
  "Đeo máng bảo vệ nếu có thói quen nghiến răng khi ngủ.",
  "Tái khám định kỳ 6 tháng/lần tại phòng khám.",
].join("\n");

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("Refusing to seed demo data in production (pass --force to override).");
  }
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@vtech.local").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const labPassword = process.env.SEED_LAB_PASSWORD;
  if (!adminPassword || !labPassword) throw new Error("Set SEED_ADMIN_PASSWORD and SEED_LAB_PASSWORD in .env");

  if (await prisma.user.findUnique({ where: { email: adminEmail } })) {
    console.log(`Seed skipped: ${adminEmail} already exists.`);
    return;
  }

  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "Quản trị Vtech", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: await hashPassword(adminPassword) },
  });
  const adminActor: Actor = { userId: admin.id, role: "SUPER_ADMIN", name: admin.name, email: admin.email, laboratoryId: null, clinicId: null, brandIds: [], sessionId: "seed" };

  const origin = await prisma.brand.create({
    data: {
      name: "Origin", slug: "origin", codePrefix: "OR", tagline: "Răng sứ cao cấp — chứng nhận chính hãng điện tử",
      primaryColor: "#0B1F3A", secondaryColor: "#C9A96E", supportPhone: "1900 0000", supportEmail: "baohanh@origin.example", websiteUrl: "https://origin.example",
    },
  });
  const elite = await prisma.brand.create({
    data: { name: "Elite Zirconia", slug: "elite-zirconia", codePrefix: "EZ", tagline: "Zirconia thẩm mỹ thế hệ mới", primaryColor: "#14213D", secondaryColor: "#E5C07B", supportPhone: "1900 0001" },
  });
  const overneer = await prisma.brand.create({
    data: { name: "Overneer", slug: "overneer", codePrefix: "OV", tagline: "Mặt dán sứ siêu mỏng", primaryColor: "#2B2D42", secondaryColor: "#D4AF37", supportPhone: "1900 0002" },
  });

  // Product information (traceability): durationMonths is only Vtech's *suggested* warranty — labs set the actual one.
  const origins = "Phôi nhập khẩu chính hãng — phân phối độc quyền bởi Vtech Dental Supply (mẫu demo)";
  const products = await Promise.all([
    prisma.product.create({ data: { brandId: origin.id, sku: "OBP", name: "Origin Beyond Plus", materialType: "Zirconia đa lớp cao cấp", origin: origins, policies: { create: { version: 1, durationMonths: 120, careInstructions: CARE } } } }),
    prisma.product.create({ data: { brandId: origin.id, sku: "ORG", name: "Origin", materialType: "Zirconia", origin: origins, policies: { create: { version: 1, durationMonths: 84, careInstructions: CARE } } } }),
    prisma.product.create({ data: { brandId: elite.id, sku: "ELZ", name: "Elite Zirconia", materialType: "Zirconia nguyên khối", origin: origins, policies: { create: { version: 1, durationMonths: 60, careInstructions: CARE } } } }),
    prisma.product.create({ data: { brandId: overneer.id, sku: "OVN", name: "Overneer Veneer", materialType: "Sứ ép thẩm mỹ", origin: origins, policies: { create: { version: 1, durationMonths: 36, careInstructions: CARE } } } }),
  ]);
  const [obp, , elz] = products;

  const labA = await prisma.laboratory.create({
    data: {
      code: "LAB-0001", name: "Labo Răng Sứ Sài Gòn", address: "123 Nguyễn Trãi, Q.5, TP.HCM", contactPerson: "Anh Minh", phone: "0901000001", email: "labo-sg@example.com",
      brands: { create: [{ brandId: origin.id }, { brandId: elite.id }] },
      clinics: { create: [{ name: "Nha khoa Thẩm mỹ Ánh Dương", address: "45 Lê Lợi, Q.1" }, { name: "Nha khoa Smile Care", address: "12 Hai Bà Trưng, Q.3" }] },
    },
  });
  const labB = await prisma.laboratory.create({
    data: { code: "LAB-0002", name: "Labo Hà Nội Dental", address: "88 Trần Duy Hưng, Hà Nội", contactPerson: "Chị Lan", phone: "0901000002", brands: { create: [{ brandId: origin.id }, { brandId: overneer.id }] } },
  });
  const labPw = await hashPassword(labPassword);
  const labAdmin = await prisma.user.create({ data: { email: "lab-a@vtech.local", name: "Nguyễn Minh (Labo SG)", role: "LAB_ADMIN", status: "ACTIVE", laboratoryId: labA.id, passwordHash: labPw } });
  await prisma.user.create({ data: { email: "staff-a@vtech.local", name: "Trần Hoa (KTV Labo SG)", role: "LAB_STAFF", status: "ACTIVE", laboratoryId: labA.id, passwordHash: labPw } });
  await prisma.user.create({ data: { email: "lab-b@vtech.local", name: "Lê Lan (Labo HN)", role: "LAB_ADMIN", status: "ACTIVE", laboratoryId: labB.id, passwordHash: labPw } });
  const labActor: Actor = { userId: labAdmin.id, role: "LAB_ADMIN", name: labAdmin.name, email: labAdmin.email, laboratoryId: labA.id, clinicId: null, brandIds: [], sessionId: "seed" };

  const batch = await createAndGenerateBatch(adminActor, { productId: obp.id, quantity: 200, notes: "Lô demo" });
  const eliteBatch = await createAndGenerateBatch(adminActor, { productId: elz.id, quantity: 50, notes: "Lô demo Elite" });
  await assignCodes(adminActor, { laboratoryId: labA.id, batchId: batch.id, serialFrom: 1, serialTo: 100, note: "Demo" });
  await assignCodes(adminActor, { laboratoryId: labB.id, batchId: batch.id, serialFrom: 101, serialTo: 150, note: "Demo" });
  await assignCodes(adminActor, { laboratoryId: labA.id, batchId: eliteBatch.id, quantity: 20, note: "Demo" });

  const codes = await prisma.warrantyCode.findMany({ where: { batchId: batch.id }, orderBy: { serial: "asc" }, take: 6 });
  const eliteCodes = await prisma.warrantyCode.findMany({ where: { batchId: eliteBatch.id }, orderBy: { serial: "asc" }, take: 2 });
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  const base = (name: string, phone: string, teeth: number[], clinic: string, install: string | null, completion: string, warrantyMonths = 120) => ({
    patient: { fullName: name, phone, birthYear: 1980, externalRef: null, consent: true as const },
    clinic: { clinicId: null, name: clinic, dentistName: "BS. Phạm Quốc Khánh", phone: null },
    restoration: {
      restorationType: teeth.length > 2 ? "Cầu răng (Bridge)" : "Mão đơn (Crown)",
      teeth: teeth.map((toothNumber) => ({ toothNumber, restorationType: null, shade: "A2", notes: null })),
      completionDate: d(completion), installationDate: install ? d(install) : null, warrantyMonths, materialLotNumber: "OBP-2026-09", notes: null,
    },
  });

  const active = await activateWarranty(labActor, codes[0].code, base("Nguyễn Văn An", "0912345678", [11, 12, 21, 22], "Nha khoa Thẩm mỹ Ánh Dương", today, today));
  const pending = await activateWarranty(labActor, codes[1].code, base("Trần Thị Bình", "0987654321", [36, 37], "Nha khoa Smile Care", null, today));
  const expired = await activateWarranty(labActor, eliteCodes[0].code, base("Lê Văn Cường", "0909090909", [46], "Nha khoa Smile Care", "2020-03-10", "2020-03-01", 60));
  const revoked = await activateWarranty(labActor, codes[2].code, base("Phạm Thị Dung", "0911111111", [14], "Nha khoa Thẩm mỹ Ánh Dương", today, today));
  await revokeCode(adminActor, revoked.code, "Demo: thẻ bị thất lạc và phát hành lại");

  console.log("\n✅ Seed completed\n");
  console.log(`Super admin : ${adminEmail}  (password from SEED_ADMIN_PASSWORD)`);
  console.log("Lab A admin : lab-a@vtech.local / staff-a@vtech.local  (password from SEED_LAB_PASSWORD)");
  console.log("Lab B admin : lab-b@vtech.local\n");
  const url = process.env.APP_URL ?? "http://localhost:3000";
  console.log("Sample QR pages:");
  console.log(`  ACTIVE              ${url}/w/${active.code}   (access code ${active.accessCode}, phone 0912345678)`);
  console.log(`  PENDING INSTALL     ${url}/w/${pending.code}`);
  console.log(`  EXPIRED             ${url}/w/${expired.code}`);
  console.log(`  REVOKED             ${url}/w/${revoked.code}`);
  console.log(`  NOT ACTIVATED       ${url}/w/${codes[3].code}   (assigned to Lab A — try activating it)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
