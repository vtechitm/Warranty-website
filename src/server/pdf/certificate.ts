import { rgb } from "pdf-lib";
import { fmtDate, fmtDateVN, fmtDuration, lastCoveredDay, PUBLIC_STATE_LABEL } from "@/lib/format";
import { createDoc, drawQr, fitSize, hexColor, mm, wrap } from "./common";

export type CertificateData = {
  code: string;
  url: string;
  state: string;
  brand: { name: string; primaryColor: string; secondaryColor: string; supportPhone?: string | null; supportEmail?: string | null; websiteUrl?: string | null };
  productName: string;
  materialType?: string | null;
  origin?: string | null;
  activatedAt: Date | string | null;
  warrantyStartDate: Date | string | null;
  warrantyEndDate: Date | string | null;
  durationMonths: number | null;
  unitCount: number | null;
  laboratoryName: string | null;
  conditions?: string | null;
  exclusions?: string | null;
  careInstructions?: string | null;
  policyVersion?: number | null;
  /** Present only for authorized viewers (lab, admin, verified patient). */
  private?: {
    patientName: string;
    clinicName: string | null;
    dentistName: string | null;
    restorationType: string;
    teeth: number[];
    installationDate: Date | string | null;
    accessCode?: string | null;
  };
};

const A4 = { w: 595.28, h: 841.89 };

export async function renderCertificatePdf(data: CertificateData): Promise<Uint8Array> {
  const { doc, fonts } = await createDoc({
    title: `Chứng nhận nguồn gốc xuất xứ ${data.code}`,
    subject: `${data.brand.name} ${data.productName} — ${PUBLIC_STATE_LABEL[data.state] ?? data.state}`,
    keywords: [data.code, data.brand.name, data.productName],
  });
  const page = doc.addPage([A4.w, A4.h]);
  const navy = hexColor(data.brand.primaryColor);
  const gold = hexColor(data.brand.secondaryColor);
  const ink = rgb(0.13, 0.15, 0.2);
  const muted = rgb(0.42, 0.45, 0.5);
  const M = mm(16);
  const W = A4.w - M * 2;

  // Frame
  page.drawRectangle({ x: mm(8), y: mm(8), width: A4.w - mm(16), height: A4.h - mm(16), borderColor: gold, borderWidth: 1.2 });
  page.drawRectangle({ x: mm(10), y: mm(10), width: A4.w - mm(20), height: A4.h - mm(20), borderColor: gold, borderWidth: 0.4 });

  // Header band
  const headerH = mm(46);
  const headerY = A4.h - mm(10) - headerH;
  page.drawRectangle({ x: mm(10), y: headerY, width: A4.w - mm(20), height: headerH, color: navy });
  page.drawText(data.brand.name.toUpperCase(), { x: M, y: headerY + headerH - mm(14), size: 22, font: fonts.bold, color: gold });
  page.drawText("TRUY XUẤT NGUỒN GỐC XUẤT XỨ", { x: M, y: headerY + headerH - mm(21), size: 8.5, font: fonts.semibold, color: rgb(1, 1, 1), opacity: 0.75 });
  const title = "CHỨNG NHẬN NGUỒN GỐC XUẤT XỨ";
  page.drawText(title, { x: M, y: headerY + mm(9), size: fitSize(title, fonts.bold, 15, W - mm(40)), font: fonts.bold, color: rgb(1, 1, 1) });

  // Status pill (top right)
  const stateText = (PUBLIC_STATE_LABEL[data.state] ?? data.state).toUpperCase();
  const pillW = fonts.bold.widthOfTextAtSize(stateText, 8.5) + mm(8);
  const pillColor = data.state === "ACTIVE" ? rgb(0.13, 0.55, 0.33) : data.state === "REVOKED" ? rgb(0.75, 0.15, 0.15) : data.state === "EXPIRED" ? rgb(0.45, 0.45, 0.45) : rgb(0.8, 0.55, 0.1);
  page.drawRectangle({ x: A4.w - M - pillW, y: headerY + headerH - mm(16), width: pillW, height: mm(7), color: pillColor });
  page.drawText(stateText, { x: A4.w - M - pillW + mm(4), y: headerY + headerH - mm(13.8), size: 8.5, font: fonts.bold, color: rgb(1, 1, 1) });

  let y = headerY - mm(12);

  // Certificate number + QR
  const qrSize = mm(42);
  drawQr(page, data.url, A4.w - M - qrSize, y - qrSize + mm(4), qrSize, navy);
  page.drawText("Quét để xác thực trực tuyến", { x: A4.w - M - qrSize + mm(4), y: y - qrSize - mm(1), size: 7, font: fonts.regular, color: muted });

  page.drawText("SỐ CHỨNG NHẬN", { x: M, y, size: 8, font: fonts.semibold, color: muted });
  y -= mm(8);
  page.drawText(data.code, { x: M, y, size: 24, font: fonts.bold, color: navy });
  y -= mm(9);
  page.drawText(data.productName, { x: M, y, size: 14, font: fonts.semibold, color: ink });
  if (data.materialType) {
    y -= mm(6);
    page.drawText(data.materialType, { x: M, y, size: 9.5, font: fonts.regular, color: muted });
  }
  y -= mm(6);
  page.drawText(data.url, { x: M, y, size: 7.5, font: fonts.regular, color: muted });

  y = Math.min(y, headerY - mm(12) - qrSize) - mm(12);

  // Gold rule
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.8, color: gold });
  y -= mm(9);

  // Fact grid (2 columns)
  const lastDay = lastCoveredDay(data.warrantyEndDate as Date | string | null);
  const facts: [string, string][] = [
    ["Xuất xứ phôi", data.origin ?? data.brand.name],
    ["Labo chế tác (ủy quyền)", data.laboratoryName ?? "—"],
    ["Ngày kích hoạt", fmtDateVN(data.activatedAt)],
    ["Số đơn vị phục hình", data.unitCount ? `${data.unitCount} răng` : "—"],
    ["Bảo hành do labo cung cấp", fmtDuration(data.durationMonths)],
    ["Hiệu lực bảo hành đến hết", lastDay ? fmtDate(lastDay) : data.activatedAt ? "Chờ xác nhận ngày lắp" : "—"],
  ];
  if (data.private) {
    facts.push(
      ["Bệnh nhân", data.private.patientName],
      ["Phòng khám", data.private.clinicName ?? "—"],
      ["Bác sĩ", data.private.dentistName ?? "—"],
      ["Loại phục hình", data.private.restorationType],
      ["Vị trí răng (FDI)", data.private.teeth.join(", ")],
      ["Ngày lắp", fmtDate(data.private.installationDate)],
    );
  }
  const colW = W / 2;
  for (let i = 0; i < facts.length; i += 2) {
    for (let j = 0; j < 2 && i + j < facts.length; j++) {
      const [label, value] = facts[i + j];
      const x = M + j * colW;
      page.drawText(label.toUpperCase(), { x, y, size: 7, font: fonts.semibold, color: muted });
      page.drawText(value, { x, y: y - mm(5.5), size: fitSize(value, fonts.semibold, 11, colW - mm(6)), font: fonts.semibold, color: ink });
    }
    y -= mm(14);
  }

  if (data.private?.accessCode) {
    const boxH = mm(16);
    page.drawRectangle({ x: M, y: y - boxH + mm(6), width: W, height: boxH, color: rgb(0.98, 0.96, 0.92), borderColor: gold, borderWidth: 0.6 });
    page.drawText("MÃ XÁC THỰC BỆNH NHÂN — giữ bí mật, dùng để xem hồ sơ phục hình cá nhân", { x: M + mm(4), y: y, size: 7, font: fonts.semibold, color: muted });
    page.drawText(data.private.accessCode, { x: M + mm(4), y: y - mm(7.5), size: 15, font: fonts.bold, color: navy });
    y -= boxH + mm(4);
  }

  // Terms
  const bottom = mm(34);
  const lineH = mm(3.9);
  const section = (heading: string, body: string | null | undefined) => {
    if (!body || y < bottom + mm(8)) return;
    page.drawText(heading.toUpperCase(), { x: M, y, size: 8, font: fonts.bold, color: navy });
    y -= mm(4.8);
    const lines = wrap(body, fonts.regular, 8, W);
    for (let i = 0; i < lines.length; i++) {
      const isLastRoom = y - lineH < bottom;
      let line = lines[i];
      if (isLastRoom && i < lines.length - 1) {
        // Out of space: never cut silently — point the reader to the full terms online.
        const suffix = " … (xem đầy đủ tại trang QR)";
        while (line && fonts.regular.widthOfTextAtSize(line + suffix, 8) > W) line = line.slice(0, line.lastIndexOf(" "));
        page.drawText(line + suffix, { x: M, y, size: 8, font: fonts.regular, color: ink });
        y -= lineH;
        return;
      }
      page.drawText(line, { x: M, y, size: 8, font: fonts.regular, color: ink });
      y -= lineH;
    }
    y -= mm(2.5);
  };
  section("Điều kiện bảo hành", data.conditions);
  section("Trường hợp không bảo hành", data.exclusions);
  section("Hướng dẫn chăm sóc", data.careInstructions);

  // Footer
  const footerY = mm(18);
  page.drawLine({ start: { x: M, y: footerY + mm(9) }, end: { x: A4.w - M, y: footerY + mm(9) }, thickness: 0.4, color: gold });
  const support = [data.brand.supportPhone && `Hotline: ${data.brand.supportPhone}`, data.brand.supportEmail, data.brand.websiteUrl].filter(Boolean).join("  ·  ");
  page.drawText(support || "Vtech Dental Supply", { x: M, y: footerY + mm(3.5), size: 7.5, font: fonts.regular, color: muted });
  const note = "Chứng nhận nguồn gốc điện tử do Vtech phát hành — tình trạng hiện hành luôn được xác thực tại địa chỉ QR. Bảo hành phục hình thuộc trách nhiệm của labo chế tác.";
  page.drawText(note, { x: M, y: footerY - mm(1), size: 6.5, font: fonts.regular, color: muted });

  return doc.save();
}
