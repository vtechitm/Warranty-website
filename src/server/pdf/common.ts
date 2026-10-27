import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fontCache: { regular: Buffer; semibold: Buffer; bold: Buffer } | null = null;

async function fontBytes() {
  if (!fontCache) {
    const [regular, semibold, bold] = await Promise.all([
      readFile(path.join(FONT_DIR, "BeVietnamPro-Regular.ttf")),
      readFile(path.join(FONT_DIR, "BeVietnamPro-SemiBold.ttf")),
      readFile(path.join(FONT_DIR, "BeVietnamPro-Bold.ttf")),
    ]);
    fontCache = { regular, semibold, bold };
  }
  return fontCache;
}

export type Fonts = { regular: PDFFont; semibold: PDFFont; bold: PDFFont };

/** New document with embedded Unicode (Vietnamese) fonts, subsetted to used glyphs. */
export async function createDoc(meta: { title: string; subject?: string; keywords?: string[] }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await fontBytes();
  const fonts: Fonts = {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    semibold: await doc.embedFont(bytes.semibold, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
  };
  doc.setTitle(meta.title);
  doc.setAuthor("Vtech – Nền tảng truy xuất nguồn gốc");
  doc.setProducer("Vtech – Nền tảng truy xuất nguồn gốc");
  doc.setCreator("Vtech – Nền tảng truy xuất nguồn gốc");
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords) doc.setKeywords(meta.keywords);
  return { doc, fonts };
}

export const mm = (v: number) => (v * 72) / 25.4;

export function hexColor(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Draws a QR code as vector rectangles (crisp at any print size, no raster scaling).
 * Horizontal runs of dark modules are merged to keep the content stream small.
 */
export function drawQr(page: PDFPage, text: string, x: number, y: number, size: number, color = rgb(0, 0, 0)) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "Q" });
  const n = qr.modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  // One SVG path per QR (in module units, y-down), scaled to the cell size: a single PDF fill op.
  let d = "";
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!qr.modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && qr.modules.get(row, col)) col++;
      d += `M${quiet + start} ${quiet + row}h${col - start}v1h${start - col}z`;
    }
  }
  page.drawSvgPath(d, { x, y: y + size, scale: cell, color, borderWidth: 0 });
}

/** Greedy word wrap for a given font/size. */
export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Shrinks font size until the text fits on one line. */
export function fitSize(text: string, font: PDFFont, maxSize: number, maxWidth: number, minSize = 5) {
  let s = maxSize;
  while (s > minSize && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25;
  return s;
}
