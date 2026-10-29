import ExcelJS from "exceljs";
import { badRequest } from "./errors";

/** Spreadsheet upload helpers shared by Excel / CSV imports. */

export const SHEET_MAX_BYTES = 5 * 1024 * 1024;

/** Header cell → comparable key: no accents, lowercase, letters/digits only ("Mã labo" → "malabo"). */
export const headerKey = (s: string) =>
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

/** Reads the first sheet of an .xlsx, or a .csv, into rows of trimmed strings. */
export async function readSheet(buffer: Buffer, filename: string): Promise<string[][]> {
  if (buffer.length === 0) throw badRequest("Tệp rỗng", "INVALID_FILE");
  if (buffer.length > SHEET_MAX_BYTES) throw badRequest("Tệp quá lớn (tối đa 5 MB)", "FILE_TOO_LARGE");
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
  return table.map((r) => r.map((c) => String(c ?? "").trim()));
}
