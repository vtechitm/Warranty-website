import ExcelJS from "exceljs";
import JSZip from "jszip";
import { fmtDate, fmtDateTimeVN, LIFECYCLE_LABEL } from "@/lib/format";
import type { Actor } from "../auth/permissions";
import { assertCan } from "../auth/permissions";
import { AppError } from "../errors";
import { renderLabelsPdf, LABEL_TEMPLATES, MAX_LABELS_PER_FILE, type LabelTemplateId } from "../pdf/labels";
import { audit } from "./audit";
import { qrPng, qrSvg } from "./qr";
import { batchCodesForExport, searchCodes } from "./warranty-codes";
import type { warrantySearchSchema } from "../validation";
import type { z } from "zod";

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function exportBatchXlsx(actor: Actor, batchId: string) {
  assertCan(actor, "report:export");
  const { batch, codes } = await batchCodesForExport(actor, batchId);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vtech Dental Warranty";
  const ws = wb.addWorksheet(batch.batchNumber);
  ws.columns = [
    { header: "Serial", key: "serial", width: 8 },
    { header: "Mã bảo hành", key: "code", width: 18 },
    { header: "URL QR", key: "url", width: 52 },
    { header: "Thương hiệu", key: "brand", width: 16 },
    { header: "Sản phẩm", key: "product", width: 26 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Labo", key: "lab", width: 28 },
    { header: "Ngày cấp", key: "assignedAt", width: 18 },
    { header: "Ngày kích hoạt", key: "activatedAt", width: 18 },
  ];
  for (const c of codes) {
    ws.addRow({
      serial: c.serial, code: c.code, url: c.url, brand: batch.brand.name, product: batch.product.name,
      status: LIFECYCLE_LABEL[c.status], lab: c.assignedLaboratory ? `${c.assignedLaboratory.code} — ${c.assignedLaboratory.name}` : "",
      assignedAt: c.assignedAt ? fmtDateTimeVN(c.assignedAt) : "", activatedAt: c.activatedAt ? fmtDateTimeVN(c.activatedAt) : "",
    });
  }
  styleHeader(ws);
  await audit(actor, { action: "export.batch_xlsx", entityType: "WarrantyBatch", entityId: batchId, metadata: { rows: codes.length } });
  return { filename: `${batch.batchNumber}.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}

export async function exportBatchQrZip(actor: Actor, batchId: string, format: "png" | "svg", range: { serialFrom?: number; serialTo?: number }) {
  assertCan(actor, "report:export");
  const { batch, codes } = await batchCodesForExport(actor, batchId, range);
  if (codes.length > 10_000) throw new AppError("BAD_REQUEST", "Tối đa 10.000 mã mỗi tệp ZIP");
  const zip = new JSZip();
  const folder = zip.folder(batch.batchNumber)!;
  const manifest = ["serial,code,url"];
  for (const c of codes) {
    const name = `${String(c.serial).padStart(5, "0")}_${c.code}.${format}`;
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
    { header: "Mã bảo hành", key: "code", width: 18 },
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
      code: c.code, batch: c.batch.batchNumber, brand: c.brand.name, product: c.product.name, status: LIFECYCLE_LABEL[c.status],
      lab: c.assignedLaboratory?.name ?? "", clinic: c.case?.clinicName ?? "", patient: c.case?.patient.fullName ?? "",
      units: c.case?.unitCount ?? "", activatedAt: c.activatedAt ? fmtDateTimeVN(c.activatedAt) : "", end: c.case?.warrantyEndDate ? fmtDate(c.case.warrantyEndDate) : "",
    });
  }
  styleHeader(ws);
  await audit(actor, { action: "export.warranties_xlsx", entityType: "WarrantyCode", metadata: { rows: rows.length, includePatient } });
  return { filename: `bao-hanh-${new Date().toISOString().slice(0, 10)}.xlsx`, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
}
