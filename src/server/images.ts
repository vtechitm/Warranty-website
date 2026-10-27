import { badRequest } from "./errors";

/**
 * Shared upload validation for images (claim photos, brand page assets). The real type is detected from the
 * file's first bytes; the declared MIME type and file name are never trusted. SVG is deliberately not accepted
 * (it can carry scripts).
 */
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ImageType = keyof typeof IMAGE_TYPES;

export type ValidatedImage = { body: Buffer; contentType: ImageType; ext: string };
export type UploadedFile = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

/** Detects the real image type from its first bytes. */
export function sniffImageType(b: Buffer): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Validates one uploaded image: non-empty, at most `maxBytes`, JPEG/PNG/WebP by content, declared type consistent. */
export async function validateImageFile(f: UploadedFile, maxBytes: number): Promise<ValidatedImage> {
  const maxMb = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
  if (f.size === 0) throw badRequest(`Ảnh “${f.name}” rỗng`, "INVALID_IMAGE");
  if (f.size > maxBytes) throw badRequest(`Ảnh “${f.name}” vượt quá ${maxMb} MB`, "IMAGE_TOO_LARGE");
  const body = Buffer.from(await f.arrayBuffer());
  if (body.length > maxBytes) throw badRequest(`Ảnh “${f.name}” vượt quá ${maxMb} MB`, "IMAGE_TOO_LARGE");
  const sniffed = sniffImageType(body);
  if (!sniffed) throw badRequest(`“${f.name}” không phải ảnh JPEG, PNG hoặc WebP`, "UNSUPPORTED_IMAGE");
  // A declared type that disagrees with the content is rejected (generic / empty types are allowed).
  const declared = f.type.toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== sniffed && !(declared === "image/jpg" && sniffed === "image/jpeg")) {
    throw badRequest(`Định dạng ảnh “${f.name}” không khớp nội dung tệp`, "UNSUPPORTED_IMAGE");
  }
  return { body, contentType: sniffed, ext: IMAGE_TYPES[sniffed] };
}
