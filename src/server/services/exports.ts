import ExcelJS from "exceljs";
import JSZip from "jszip";
import { fmtDate, fmtDateTimeVN, LIFECYCLE_LABEL } from "@/lib/format";
import type { Actor } from "../auth/permissions";
import { assertCan } from "../auth/permissions";
import { AppError } from "../errors";
import { renderLabelsPdf, LABEL_TEMPLATES, MAX_LABELS_PER_FILE, type LabelTemplateId } from "../pdf/labels";
import { audit } from "./audit";
import { qrPng, qrSvg, warrantyUrl } from "./qr";
import { batchCodesForExport, searchCodes } from "./warranty-codes";
import type { warrantySearchSchema } from "../validation";
import type { z } from "zod";

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** QR image file name used in ZIP / print packages; referenced from the Excel & CSV so printers can match them. */
export const qrFileName = (serial: number, code: string, ext: "png" | "svg") => `${String(serial).padStart(5, "0")}_${code}.${ext}`;

/** Above this many rows QR pictures are not embedded in Excel (file size); use the print package ZIP instead. */
export const XLSX_QR_IMAGE_LIMIT = 5000;
const QR_CELL_PX = 110;

/**
 * Embeds a QR picture in column `col` (0-based) for each data row (row 2 onwards).
 * Printers can copy the pictures directly; the URL column is the QR content for variable-data printing software.
 */
async function embedQrImages(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, col: number, urls: (string | null)[]) {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    const id = wb.addImage({ buffer: (await qrPng(url, 220)) as unknown as ExcelJS.Buffer, extension: "png" });
    ws.getRow(i + 2).height = QR_CELL_PX * 0.75 + 6;
    ws.addImage(id, { tl: { col: col + 0.1, row: i + 1 + 0.05 }, ext: { width: QR_CELL_PX, height: QR_CELL_PX }, editAs: "oneCell" });
  }
  ws.getColumn(col + 1).width = 17;
  ws.eachRow((row, n) => { if (n > 1) row.alignment = { vertical: "middle" }; });
}

export async function exportBatchXlsx(actor: Actor, batchId: string) {
  assertCan(actor, "report:export");
  const { batch, codes } = await batchCodesForExport(actor, batchId);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vtech Dental Warranty";
  await buildBatchSheet(wb, batch, codes);
  await audit(actor, { action: "export.batch_xlsx", entityType: "WarrantyBatch", entityId: batchId, metadata: { rows: codes.length } });
  return { filename: `${batch.batchNumber}.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}

type BatchExport = Awaited<ReturnType<typeof batchCodesForExport>>;

async function buildBatchSheet(wb: ExcelJS.Workbook, batch: BatchExport["batch"], codes: BatchExport["codes"]) {
  const ws = wb.addWorksheet(batch.batchNumber);
  const withImages = codes.length <= XLSX_QR_IMAGE_LIMIT;
  ws.columns = [
    { header: "Serial", key: "serial", width: 8 },
    { header: "Mã bảo hành", key: "code", width: 16 },
    { header: "Ảnh QR", key: "qr", width: 17 },
    { header: "Nội dung QR (URL)", key: "url", width: 46 },
    { header: "Tên file ảnh QR", key: "file", width: 26 },
    { header: "Thương hiệu", key: "brand", width: 16 },
    { header: "Sản phẩm", key: "product", width: 26 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Labo", key: "lab", width: 28 },
    { header: "Ngày cấp", key: "assignedAt", width: 18 },
    { header: "Ngày kích hoạt", key: "activatedAt", width: 18 },
  ];
  for (const c of codes) {
    ws.addRow({
      serial: c.serial, code: c.code, qr: withImages ? "" : "Xem gói in ấn", url: c.url, file: qrFileName(c.serial, c.code, "png"), brand: batch.brand.name, product: batch.product.name,
      status: LIFECYCLE_LABEL[c.status], lab: c.assignedLaboratory ? `${c.assignedLaboratory.code} — ${c.assignedLaboratory.name}` : "",
      assignedAt: c.assignedAt ? fmtDateTimeVN(c.assignedAt) : "", activatedAt: c.activatedAt ? fmtDateTimeVN(c.activatedAt) : "",
    });
  }
  styleHeader(ws);
  if (withImages) await embedQrImages(wb, ws, 2, codes.map((c) => c.url));
  return ws;
}

/**
 * Everything a print shop needs for variable-data card printing, in one ZIP:
 * Excel (with QR pictures), CSV for data merge (InDesign / CorelDRAW / BarTender, `@anh_qr` = image path),
 * QR images as PNG (600 px) and SVG (vector), and a Vietnamese README.
 */
export async function exportBatchPrintPackage(actor: Actor, batchId: string, range: { serialFrom?: number; serialTo?: number }) {
  assertCan(actor, "report:export");
  const { batch, codes } = await batchCodesForExport(actor, batchId, range);
  if (codes.length === 0) throw new AppError("BAD_REQUEST", "Không có mã nào trong khoảng serial đã chọn");
  if (codes.length > 10_000) throw new AppError("BAD_REQUEST", "Tối đa 10.000 mã mỗi gói in — hãy chọn khoảng serial nhỏ hơn");
  const zip = new JSZip();
  const csv = ["serial,ma_bao_hanh,noi_dung_qr,thuong_hieu,san_pham,@anh_qr,@anh_qr_svg"];
  for (const c of codes) {
    zip.file(`QR_PNG/${qrFileName(c.serial, c.code, "png")}`, await qrPng(c.url, 600));
    zip.file(`QR_SVG/${qrFileName(c.serial, c.code, "svg")}`, await qrSvg(c.url));
    csv.push([c.serial, c.code, c.url, batch.brand.name, batch.product.name, `QR_PNG/${qrFileName(c.serial, c.code, "png")}`, `QR_SVG/${qrFileName(c.serial, c.code, "svg")}`].map(csvCell).join(","));
  }
  zip.file("du-lieu-in.csv", "\uFEFF" + csv.join("\r\n"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vtech Dental Warranty";
  await buildBatchSheet(wb, batch, codes);
  zip.file("du-lieu-in.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
  zip.file("HUONG-DAN-NHA-IN.txt", printReadme(batch.batchNumber, batch.product.name, codes.length, codes[0].serial, codes.at(-1)!.serial));
  await audit(actor, { action: "export.batch_print_package", entityType: "WarrantyBatch", entityId: batchId, metadata: { count: codes.length } });
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const suffix = range.serialFrom || range.serialTo ? `_${codes[0].serial}-${codes.at(-1)!.serial}` : "";
  return { filename: `${batch.batchNumber}_goi-in${suffix}.zip`, buffer };
}

const csvCell = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function printReadme(batchNumber: string, product: string, count: number, from: number, to: number) {
  return [
    `GÓI DỮ LIỆU IN THẺ BẢO HÀNH — ${batchNumber}`,
    `Sản phẩm: ${product} · Số mã: ${count} · Serial ${from}–${to}`,
    "",
    "NỘI DUNG",
    "  du-lieu-in.xlsx   Danh sách mã kèm ảnh QR (mở bằng Excel).",
    "  du-lieu-in.csv    Dữ liệu trộn in (UTF-8): serial, ma_bao_hanh, noi_dung_qr, @anh_qr (đường dẫn ảnh PNG), @anh_qr_svg.",
    "  QR_PNG/           Ảnh QR 600×600 px, tên tệp = <serial 5 số>_<mã>.png",
    "  QR_SVG/           Ảnh QR dạng vector (khuyên dùng cho in offset / khổ nhỏ).",
    "",
    "CÁCH IN HÀNG LOẠT",
    "  • Adobe InDesign: Window > Utilities > Data Merge > chọn du-lieu-in.csv. Cột bắt đầu bằng @ là ảnh — đặt trường",
    "    @anh_qr (hoặc @anh_qr_svg) vào khung ảnh, ma_bao_hanh vào khung chữ. Giữ nguyên cấu trúc thư mục khi giải nén.",
    "  • CorelDRAW (Print Merge) / BarTender / phần mềm in biến đổi khác: có thể tự tạo QR từ cột noi_dung_qr,",
    "    hoặc chèn ảnh theo cột @anh_qr.",
    "",
    "YÊU CẦU KỸ THUẬT",
    "  • QR in tối thiểu 24 mm, có viền trắng (quiet zone) quanh mã, mực đen trên nền sáng; không kéo méo tỉ lệ.",
    "  • Mã bảo hành in đúng như cột ma_bao_hanh (2 chữ cái + 8 chữ số). Có thể in tách nhóm cho dễ đọc, VD: OR 4829 1037.",
    "  • Mỗi mã là duy nhất — KHÔNG in lặp, KHÔNG sửa nội dung QR. Quét thử vài thẻ đầu, giữa, cuối mỗi tờ trước khi in số lượng lớn.",
    "  • Thứ tự in theo cột serial để đối chiếu khi giao thẻ cho labo.",
    "",
    "Tệp này chứa mã bảo hành thật — chỉ dùng cho mục đích in ấn theo đơn đặt hàng của Vtech, không chia sẻ cho bên thứ ba.",
    "",
  ].join("\r\n");
}

export async function exportBatchQrZip(actor: Actor, batchId: string, format: "png" | "svg", range: { serialFrom?: number; serialTo?: number }) {
  assertCan(actor, "report:export");
  const { batch, codes } = await batchCodesForExport(actor, batchId, range);
  if (codes.length > 10_000) throw new AppError("BAD_REQUEST", "Tối đa 10.000 mã mỗi tệp ZIP");
  const zip = new JSZip();
  const folder = zip.folder(batch.batchNumber)!;
  const manifest = ["serial,code,url"];
  for (const c of codes) {
    const name = qrFileName(c.serial, c.code, format);
    folder.file(name, format === "png" ? await qrPng(c.url, 600) : await qrSvg(c.url));
    manifest.push(`${c.serial},${c.code},${c.url}`);
  }
  folder.file("manifest.csv", "﻿" + manifest.join("\n"));
  await audit(actor, { action: "export.batch_qr_zip", entityType: "WarrantyBatch", entityId: batchId, metadata: { count: codes.length, format } });
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { filename: `${batch.batchNumber}_QR_${format.toUpperCase()}.zip`, buffer };
}

export async function exportBatchLabels(actor: Actor, batchId: string, template: LabelTemplateId, range: { serialFrom?: number; serialTo?: number }, showCutLines: boolean) {
  assertCan(actor, "report:export");
  if (!LABEL_TEMPLATES[template]) throw new AppError("BAD_REQUEST", "Mẫu nhãn không hợp lệ");
  const { batch, codes } = await batchCodesForExport(actor, batchId, range);
  if (codes.length > MAX_LABELS_PER_FILE) {
    throw new AppError("BAD_REQUEST", `Mỗi tệp in tối đa ${MAX_LABELS_PER_FILE} nhãn. Hãy chọn khoảng serial nhỏ hơn.`);
  }
  const pdf = await renderLabelsPdf({
    template, brand: batch.brand, productName: batch.product.name, batchNumber: batch.batchNumber,
    items: codes.map((c) => ({ code: c.code, url: c.url, serial: c.serial })), showCutLines,
  });
  await audit(actor, { action: "export.batch_labels", entityType: "WarrantyBatch", entityId: batchId, metadata: { count: codes.length, template } });
  const suffix = range.serialFrom || range.serialTo ? `_${range.serialFrom ?? 1}-${range.serialTo ?? codes.at(-1)?.serial}` : "";
  return { filename: `${batch.batchNumber}_labels${suffix}.pdf`, buffer: Buffer.from(pdf) };
}

/** Export search results (warranty list). Patient columns only for roles allowed to see them. */
export async function exportWarrantiesXlsx(actor: Actor, params: z.infer<typeof warrantySearchSchema>) {
  const includePatient = actor.role === "SUPER_ADMIN" || actor.role === "LAB_ADMIN";
  const rows: Awaited<ReturnType<typeof searchCodes>>["items"] = [];
  for (let page = 1; ; page++) {
    const r = await searchCodes(actor, { ...params, page, pageSize: 200 });
    rows.push(...r.items);
    if (rows.length >= r.total || r.items.length === 0 || rows.length >= 50_000) break;
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bảo hành");
  ws.columns = [
    { header: "Mã bảo hành", key: "code", width: 16 },
    { header: "Ảnh QR", key: "qr", width: 17 },
    { header: "Nội dung QR (URL)", key: "url", width: 46 },
    { header: "Lô", key: "batch", width: 16 },
    { header: "Thương hiệu", key: "brand", width: 16 },
    { header: "Sản phẩm", key: "product", width: 26 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Labo", key: "lab", width: 26 },
    { header: "Phòng khám", key: "clinic", width: 26 },
    ...(includePatient ? [{ header: "Bệnh nhân", key: "patient", width: 24 }] : []),
    { header: "Số răng", key: "units", width: 9 },
    { header: "Ngày kích hoạt", key: "activatedAt", width: 18 },
    { header: "Hết hạn", key: "end", width: 14 },
  ];
  for (const c of rows) {
    ws.addRow({
      code: c.code, qr: rows.length <= XLSX_QR_IMAGE_LIMIT ? "" : "Xem gói in ấn của lô", url: warrantyUrl(c.batch.qrBaseUrl, c.code), batch: c.batch.batchNumber, brand: c.brand.name, product: c.product.name, status: LIFECYCLE_LABEL[c.status],
      lab: c.assignedLaboratory?.name ?? "", clinic: c.case?.clinicName ?? "", patient: c.case?.patient.fullName ?? "",
      units: c.case?.unitCount ?? "", activatedAt: c.activatedAt ? fmtDateTimeVN(c.activatedAt) : "", end: c.case?.warrantyEndDate ? fmtDate(c.case.warrantyEndDate) : "",
    });
  }
  styleHeader(ws);
  if (rows.length <= XLSX_QR_IMAGE_LIMIT) await embedQrImages(wb, ws, 1, rows.map((c) => warrantyUrl(c.batch.qrBaseUrl, c.code)));
  await audit(actor, { action: "export.warranties_xlsx", entityType: "WarrantyCode", metadata: { rows: rows.length, includePatient } });
  return { filename: `bao-hanh-${new Date().toISOString().slice(0, 10)}.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}
