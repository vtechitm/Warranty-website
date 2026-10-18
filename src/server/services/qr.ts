import QRCode from "qrcode";

/** Error correction level Q (25%) keeps printed codes readable when scuffed. */
const OPTS = { errorCorrectionLevel: "Q" as const, margin: 2 };

export function warrantyUrl(qrBaseUrl: string, code: string) {
  return `${qrBaseUrl.replace(/\/+$/, "")}/w/${encodeURIComponent(code)}`;
}

export async function qrPng(text: string, width = 600): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...OPTS, type: "png", width, color: { dark: "#000000", light: "#FFFFFF" } });
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...OPTS, type: "svg" });
}

export async function qrDataUrl(text: string, width = 480, dark = "#0B1F3A"): Promise<string> {
  return QRCode.toDataURL(text, { ...OPTS, width, color: { dark, light: "#FFFFFF" } });
}
