import { rgb } from "pdf-lib";
import { createDoc, drawQr, fitSize, hexColor, mm } from "./common";

/** Label templates. QR sizes never go below 20 mm so printed cards stay reliably scannable. */
export const LABEL_TEMPLATES = {
  "a4-3x8": { name: "A4 — 24 nhãn 70×37 mm", page: [210, 297], cols: 3, rows: 8, w: 70, h: 37, marginX: 0, marginY: 0.5, gapX: 0, gapY: 0, qr: 28 },
  "a4-2x5-card": { name: "A4 — 10 thẻ 85×54 mm (danh thiếp)", page: [210, 297], cols: 2, rows: 5, w: 85, h: 54, marginX: 15, marginY: 13.5, gapX: 10, gapY: 0, qr: 38 },
  "roll-50x30": { name: "Cuộn — nhãn 50×30 mm", page: [50, 30], cols: 1, rows: 1, w: 50, h: 30, marginX: 0, marginY: 0, gapX: 0, gapY: 0, qr: 24 },
  "roll-60x40": { name: "Cuộn — nhãn 60×40 mm", page: [60, 40], cols: 1, rows: 1, w: 60, h: 40, marginX: 0, marginY: 0, gapX: 0, gapY: 0, qr: 32 },
} as const;
export type LabelTemplateId = keyof typeof LABEL_TEMPLATES;
export const MAX_LABELS_PER_FILE = 2000;

export type LabelItem = { code: string; url: string; serial: number };

export async function renderLabelsPdf(opts: {
  template: LabelTemplateId;
  brand: { name: string; primaryColor: string };
  productName: string;
  batchNumber: string;
  items: LabelItem[];
  showCutLines?: boolean;
}) {
  const t = LABEL_TEMPLATES[opts.template];
  const { doc, fonts } = await createDoc({ title: `Nhãn QR ${opts.batchNumber}`, keywords: [opts.batchNumber] });
  const perPage = t.cols * t.rows;
  const navy = hexColor(opts.brand.primaryColor);
  const muted = rgb(0.35, 0.37, 0.42);
  const [pw, ph] = [mm(t.page[0]), mm(t.page[1])];

  for (let i = 0; i < opts.items.length; i += perPage) {
    const page = doc.addPage([pw, ph]);
    opts.items.slice(i, i + perPage).forEach((item, k) => {
      const col = k % t.cols;
      const row = Math.floor(k / t.cols);
      const x = mm(t.marginX + col * (t.w + t.gapX));
      const yTop = ph - mm(t.marginY + row * (t.h + t.gapY));
      const w = mm(t.w);
      const h = mm(t.h);
      if (opts.showCutLines) page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.3 });

      const pad = mm(t.h > 45 ? 4 : 2.5);
      const qr = mm(t.qr);
      const qrY = yTop - h + (h - qr) / 2;
      drawQr(page, item.url, x + pad, qrY, qr);

      const tx = x + pad + qr + mm(2);
      const tw = w - (tx - x) - pad;
      const big = t.h >= 45;
      let ty = yTop - pad - mm(big ? 5 : 3.5);
      const brandSize = fitSize(opts.brand.name.toUpperCase(), fonts.bold, big ? 12 : 8.5, tw);
      page.drawText(opts.brand.name.toUpperCase(), { x: tx, y: ty, size: brandSize, font: fonts.bold, color: navy });
      ty -= mm(big ? 5 : 3.6);
      const pSize = fitSize(opts.productName, fonts.semibold, big ? 8.5 : 6.5, tw);
      page.drawText(opts.productName, { x: tx, y: ty, size: pSize, font: fonts.semibold, color: muted });
      ty -= mm(big ? 8 : 5.5);
      page.drawText("MÃ BẢO HÀNH", { x: tx, y: ty, size: big ? 6 : 4.8, font: fonts.semibold, color: muted });
      ty -= mm(big ? 4.5 : 3.4);
      const cSize = fitSize(item.code, fonts.bold, big ? 11 : 8, tw);
      page.drawText(item.code, { x: tx, y: ty, size: cSize, font: fonts.bold, color: rgb(0, 0, 0) });
      ty -= mm(big ? 5 : 3.6);
      page.drawText("Quét QR để xem bảo hành", { x: tx, y: ty, size: big ? 6.5 : 5, font: fonts.regular, color: muted });
      page.drawText(`#${item.serial}`, { x: x + w - pad - fonts.regular.widthOfTextAtSize(`#${item.serial}`, 4.5), y: yTop - h + mm(1.2), size: 4.5, font: fonts.regular, color: rgb(0.6, 0.6, 0.6) });
    });
  }
  return doc.save();
}
