import { prisma } from "../db";
import { AppError, badRequest } from "../errors";
import { assertCan, type Actor } from "../auth/permissions";
import { headerKey, readSheet } from "../tabular";
import { audit } from "./audit";
import { allocateUnits } from "./units";

/**
 * Excel / CSV import of tooth-unit allocations (one row per sale): lab code, product SKU, units, invoice number.
 * Flow: upload → `previewUnitImport` (no writes) → admin reviews → `confirmUnitImport`, which re-validates every
 * row and applies all allocations in ONE transaction (all or nothing).
 */

export const UNIT_IMPORT_MAX_ROWS = 2000;

export type UnitImportRow = { row: number; labCode: string; sku: string; brandPrefix: string | null; units: string; reference: string | null };
export type UnitPreviewRow = UnitImportRow & {
  ok: boolean;
  error: string | null;
  laboratoryId: string | null;
  laboratoryName: string | null;
  productId: string | null;
  productName: string | null;
  balanceAfter: number | null;
};

const COLS = {
  lab: ["lab", "labo", "labcode", "malabo", "malab"],
  sku: ["sku", "masku", "phoi", "maphoi", "sanpham", "masanpham", "product"],
  brand: ["thuonghieu", "brand", "tientoma", "prefix"],
  units: ["units", "sodonvi", "soluong", "donvi", "sorang", "donvirang"],
  reference: ["sohoadon", "hoadon", "invoice", "reference", "chungtu", "sochungtu", "ghichu"],
} as const;

/** Header row is optional; default columns: A = lab code, B = SKU, C = units, D = invoice / note. */
export async function parseUnitSheet(buffer: Buffer, filename: string): Promise<UnitImportRow[]> {
  const table = await readSheet(buffer, filename);
  const header = (table[0] ?? []).map(headerKey);
  const find = (keys: readonly string[]) => header.findIndex((h) => keys.includes(h));
  let idx = { lab: 0, sku: 1, units: 2, reference: 3, brand: -1 };
  let start = 0;
  if (find(COLS.lab) >= 0 || find(COLS.sku) >= 0 || find(COLS.units) >= 0) {
    idx = { lab: find(COLS.lab), sku: find(COLS.sku), units: find(COLS.units), reference: find(COLS.reference), brand: find(COLS.brand) };
    if (idx.lab < 0 || idx.sku < 0 || idx.units < 0) throw badRequest("Dòng tiêu đề cần có cột “Mã labo”, “Mã phôi (SKU)” và “Số đơn vị”", "MISSING_COLUMNS");
    start = 1;
  }
  const rows: UnitImportRow[] = [];
  for (let i = start; i < table.length; i++) {
    const r = table[i];
    const get = (c: number) => (c >= 0 ? (r[c] ?? "").trim() : "");
    if (!get(idx.lab) && !get(idx.sku) && !get(idx.units)) continue;
    rows.push({ row: i + 1, labCode: get(idx.lab).toUpperCase(), sku: get(idx.sku).toUpperCase(), brandPrefix: get(idx.brand).toUpperCase() || null, units: get(idx.units), reference: get(idx.reference) || null });
  }
  if (rows.length === 0) throw badRequest("Không có dòng dữ liệu nào trong tệp", "EMPTY_SHEET");
  if (rows.length > UNIT_IMPORT_MAX_ROWS) throw badRequest(`Tối đa ${UNIT_IMPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng mỗi lần nhập`, "TOO_MANY_ROWS");
  return rows;
}

/** Validates every row and shows the resulting balances, without writing anything. */
export async function previewUnitImport(actor: Actor, rows: UnitImportRow[]) {
  assertCan(actor, "units:manage");
  if (rows.length > UNIT_IMPORT_MAX_ROWS) throw badRequest(`Tối đa ${UNIT_IMPORT_MAX_ROWS} dòng mỗi lần nhập`, "TOO_MANY_ROWS");
  const [labs, products, balances] = await Promise.all([
    prisma.laboratory.findMany({ where: { code: { in: [...new Set(rows.map((r) => r.labCode))] }, deletedAt: null }, include: { brands: true } }),
    prisma.product.findMany({ where: { sku: { in: [...new Set(rows.map((r) => r.sku))] }, deletedAt: null }, include: { brand: { select: { codePrefix: true } } } }),
    prisma.unitBalance.findMany(),
  ]);
  const running = new Map(balances.map((b) => [`${b.laboratoryId}:${b.productId}`, b.balance]));
  const out: UnitPreviewRow[] = rows.map((r) => {
    const base: UnitPreviewRow = { ...r, ok: false, error: null, laboratoryId: null, laboratoryName: null, productId: null, productName: null, balanceAfter: null };
    const fail = (error: string): UnitPreviewRow => ({ ...base, error });
    const lab = labs.find((l) => l.code.toUpperCase() === r.labCode);
    if (!r.labCode) return fail("Thiếu mã labo");
    if (!lab) return fail(`Labo ${r.labCode} không tồn tại`);
    if (lab.status !== "ACTIVE") return fail("Labo đang bị tạm ngưng");
    const matches = products.filter((p) => p.sku === r.sku && (!r.brandPrefix || p.brand.codePrefix === r.brandPrefix));
    if (!r.sku) return fail("Thiếu mã phôi (SKU)");
    if (matches.length === 0) return fail(`Không có phôi mã ${r.sku}${r.brandPrefix ? ` của thương hiệu ${r.brandPrefix}` : ""}`);
    if (matches.length > 1) return fail(`Mã phôi ${r.sku} có ở nhiều thương hiệu — thêm cột Thương hiệu (tiền tố mã, VD OR)`);
    const product = matches[0];
    const withRefs = { ...base, laboratoryId: lab.id, laboratoryName: lab.name, productId: product.id, productName: product.name };
    if (!lab.brands.some((b) => b.brandId === product.brandId)) return { ...withRefs, error: "Labo chưa được ủy quyền cho thương hiệu của phôi này" };
    const units = Number(r.units.replace(/[.,\s]/g, ""));
    if (!/^\d[\d.,\s]*$/.test(r.units) || !Number.isInteger(units) || units < 1) return { ...withRefs, error: "Số đơn vị phải là số nguyên dương" };
    if (units > 1_000_000) return { ...withRefs, error: "Số đơn vị quá lớn" };
    const key = `${lab.id}:${product.id}`;
    const after = (running.get(key) ?? 0) + units;
    running.set(key, after);
    return { ...withRefs, units: String(units), ok: true, balanceAfter: after };
  });
  const valid = out.filter((r) => r.ok);
  return {
    rows: out,
    summary: { total: out.length, valid: valid.length, invalid: out.length - valid.length, units: valid.reduce((a, r) => a + Number(r.units), 0) },
  };
}

/** Applies a previewed import. Nothing is written unless every row is valid; all rows land in one transaction. */
export async function confirmUnitImport(actor: Actor, rows: UnitImportRow[], note: string | null, filename: string | null) {
  const preview = await previewUnitImport(actor, rows);
  if (preview.summary.invalid > 0) {
    throw new AppError("VALIDATION_ERROR", `Còn ${preview.summary.invalid} dòng lỗi — sửa tệp và xem trước lại`, {
      errors: preview.rows.filter((r) => !r.ok).slice(0, 50).map((r) => ({ row: r.row, error: r.error })),
    });
  }
  await prisma.$transaction(async (tx) => {
    for (const r of preview.rows) {
      await allocateUnits(actor, { laboratoryId: r.laboratoryId!, productId: r.productId!, units: Number(r.units), kind: "ALLOCATION", reference: r.reference, note: note ?? (filename ? `Nhập từ tệp ${filename}` : null) }, tx);
    }
    await audit(actor, { action: "units.import", entityType: "Laboratory", metadata: { filename, rows: preview.rows.length, units: preview.summary.units } }, tx);
  }, { timeout: 60_000 });
  return { rows: preview.rows.length, units: preview.summary.units };
}
