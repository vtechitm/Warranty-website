import ExcelJS from "exceljs";
import { prisma } from "../db";
import { AppError, badRequest } from "../errors";
import { assertCan, type Actor } from "../auth/permissions";
import { audit } from "./audit";
import { assignCodes, CODE_PATTERN, normalizeCode } from "./warranty-codes";

/**
 * Excel / CSV import of code → laboratory assignments.
 * Flow: upload → `previewAssignmentImport` (no writes) → admin reviews → `confirmAssignmentImport`,
 * which re-validates everything and then assigns each lab's group through `assignCodes()`.
 */

export const IMPORT_MAX_ROWS = 10_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export type ImportRow = { row: number; code: string; labCode: string };
export type PreviewRow = ImportRow & {
  ok: boolean;
  error: string | null;
  laboratoryId: string | null;
  laboratoryName: string | null;
  /** Lab the code is currently assigned to (re-assignment warning). */
  previousLabCode: string | null;
};
export type ImportPreview = {
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; reassigned: number };
  groups: { laboratoryId: string; labCode: string; laboratoryName: string; count: number }[];
};

const CODE_HEADERS = ["code", "ma", "mabaohanh", "macode", "warrantycode", "mathe", "maqr"];
const LAB_HEADERS = ["lab", "labo", "labcode", "malabo", "laboratory", "laboratorycode", "malab"];

const headerKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Minimal RFC 4180 parser (quotes, escaped quotes, CRLF); auto-detects `,` `;` or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest("Không đọc được tệp Excel (.xlsx)", "INVALID_FILE");
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const values: string[] = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      values[col - 1] = c.text ?? String(c.value ?? "");
    });
    out.push(Array.from(values, (v) => v ?? ""));
  });
  return out;
}

/** Parses an uploaded .xlsx / .csv into (code, labCode) rows. Header row is optional (default: column A = code, B = lab). */
export async function parseAssignmentSheet(buffer: Buffer, filename: string): Promise<ImportRow[]> {
  if (buffer.length === 0) throw badRequest("Tệp rỗng", "INVALID_FILE");
  if (buffer.length > IMPORT_MAX_BYTES) throw badRequest("Tệp quá lớn (tối đa 5 MB)", "FILE_TOO_LARGE");
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // .xlsx is a ZIP container
  const name = filename.toLowerCase();
  let table: string[][];
  if (isZip || name.endsWith(".xlsx")) {
    if (!isZip) throw badRequest("Tệp .xlsx không hợp lệ", "INVALID_FILE");
    table = await parseXlsx(buffer);
  } else if (name.endsWith(".csv") || name.endsWith(".txt") || !name.includes(".")) {
    table = parseCsv(buffer.toString("utf8"));
  } else {
    throw badRequest("Chỉ hỗ trợ tệp .xlsx hoặc .csv", "UNSUPPORTED_FILE");
  }

  let codeCol = 0;
  let labCol = 1;
  let start = 0;
  const header = (table[0] ?? []).map((h) => headerKey(String(h)));
  const hc = header.findIndex((h) => CODE_HEADERS.includes(h));
  const hl = header.findIndex((h) => LAB_HEADERS.includes(h));
  if (hc >= 0 || hl >= 0) {
    if (hc < 0 || hl < 0) throw badRequest("Dòng tiêu đề cần có cột “Mã bảo hành” và “Mã labo”", "MISSING_COLUMNS");
    codeCol = hc;
    labCol = hl;
    start = 1;
  }

  const rows: ImportRow[] = [];
  for (let i = start; i < table.length; i++) {
    const code = String(table[i][codeCol] ?? "").trim();
    const labCode = String(table[i][labCol] ?? "").trim();
    if (!code && !labCode) continue;
    rows.push({ row: i + 1, code: normalizeCode(code), labCode: labCode.toUpperCase() });
  }
  if (rows.length === 0) throw badRequest("Không có dòng dữ liệu nào trong tệp", "EMPTY_SHEET");
  if (rows.length > IMPORT_MAX_ROWS) throw badRequest(`Tối đa ${IMPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng mỗi lần nhập`, "TOO_MANY_ROWS");
  return rows;
}

/** Validates every row without writing anything. */
export async function previewAssignmentImport(actor: Actor, rows: ImportRow[]): Promise<ImportPreview> {
  assertCan(actor, "code:assign");
  if (rows.length > IMPORT_MAX_ROWS) throw badRequest(`Tối đa ${IMPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng mỗi lần nhập`, "TOO_MANY_ROWS");

  const codes = [...new Set(rows.map((r) => r.code).filter((c) => CODE_PATTERN.test(c)))];
  const labCodes = [...new Set(rows.map((r) => r.labCode).filter(Boolean))];
  const [codeRows, labs] = await Promise.all([
    prisma.warrantyCode.findMany({
      where: { code: { in: codes } },
      select: { code: true, brandId: true, activationStatus: true, revokedAt: true, assignedLaboratory: { select: { id: true, code: true } } },
    }),
    prisma.laboratory.findMany({ where: { code: { in: labCodes }, deletedAt: null }, include: { brands: { select: { brandId: true } } } }),
  ]);
  const codeMap = new Map(codeRows.map((c) => [c.code, c]));
  const labMap = new Map(labs.map((l) => [l.code.toUpperCase(), l]));
  const seen = new Map<string, number>();

  const out: PreviewRow[] = rows.map((r) => {
    const base = { ...r, laboratoryId: null, laboratoryName: null, previousLabCode: null };
    const fail = (error: string): PreviewRow => ({ ...base, ok: false, error });
    if (!r.code) return fail("Thiếu mã bảo hành");
    if (!CODE_PATTERN.test(r.code)) return fail("Mã không đúng định dạng");
    const dup = seen.get(r.code);
    if (dup) return fail(`Trùng với dòng ${dup}`);
    seen.set(r.code, r.row);
    const wc = codeMap.get(r.code);
    if (!wc) return fail("Mã không tồn tại");
    if (wc.revokedAt) return fail("Mã đã bị thu hồi");
    if (wc.activationStatus === "ACTIVATED") return fail("Mã đã kích hoạt");
    if (!r.labCode) return fail("Thiếu mã labo");
    const lab = labMap.get(r.labCode);
    if (!lab) return fail(`Labo ${r.labCode} không tồn tại`);
    const withLab = { ...base, laboratoryId: lab.id, laboratoryName: lab.name, previousLabCode: wc.assignedLaboratory && wc.assignedLaboratory.id !== lab.id ? wc.assignedLaboratory.code : null };
    if (lab.status !== "ACTIVE") return { ...withLab, ok: false, error: "Labo đang bị tạm ngưng" };
    if (!lab.brands.some((b) => b.brandId === wc.brandId)) return { ...withLab, ok: false, error: "Labo chưa được ủy quyền cho thương hiệu của mã" };
    return { ...withLab, ok: true, error: null };
  });

  const groups = new Map<string, ImportPreview["groups"][number]>();
  for (const r of out) {
    if (!r.ok) continue;
    const g = groups.get(r.laboratoryId!) ?? { laboratoryId: r.laboratoryId!, labCode: r.labCode, laboratoryName: r.laboratoryName!, count: 0 };
    g.count++;
    groups.set(r.laboratoryId!, g);
  }
  const valid = out.filter((r) => r.ok).length;
  return {
    rows: out,
    summary: { total: out.length, valid, invalid: out.length - valid, reassigned: out.filter((r) => r.ok && r.previousLabCode).length },
    groups: [...groups.values()],
  };
}

/**
 * Applies a previewed import. All rows are re-validated; nothing is written unless every row is valid.
 * Each laboratory's group is then assigned with `assignCodes()` (its own transaction, history and audit).
 */
export async function confirmAssignmentImport(actor: Actor, rows: ImportRow[], note: string | null, filename?: string | null) {
  const preview = await previewAssignmentImport(actor, rows);
  if (preview.summary.invalid > 0) {
    throw new AppError("VALIDATION_ERROR", `Còn ${preview.summary.invalid} dòng lỗi — sửa tệp và xem trước lại`, {
      errors: preview.rows.filter((r) => !r.ok).slice(0, 50).map((r) => ({ row: r.row, code: r.code, error: r.error })),
    });
  }
  const results: { laboratoryId: string; labCode: string; assigned: number }[] = [];
  for (const g of preview.groups) {
    const codes = preview.rows.filter((r) => r.laboratoryId === g.laboratoryId).map((r) => r.code);
    const r = await assignCodes(actor, { laboratoryId: g.laboratoryId, codes, note: note ?? `Nhập từ tệp${filename ? ` ${filename}` : ""}` });
    results.push({ laboratoryId: g.laboratoryId, labCode: g.labCode, assigned: r.assigned });
  }
  const assigned = results.reduce((s, r) => s + r.assigned, 0);
  await audit(actor, { action: "code.import_assign", entityType: "WarrantyCode", metadata: { filename: filename ?? null, rows: rows.length, assigned, groups: results.map((r) => ({ lab: r.labCode, count: r.assigned })) } });
  return { assigned, groups: results };
}
