import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";
import { badRequest, notFound } from "../errors";
import { IMAGE_TYPES, sniffImageType, validateImageFile, type UploadedFile, type ValidatedImage } from "../images";
import { storage } from "../storage";
import type { Actor } from "../auth/permissions";
import { can } from "../auth/permissions";
import { normalizeCode } from "./warranty-codes";

/**
 * Claim photos. Files are validated by size, count and *content* (magic bytes) — the declared MIME type
 * and file name are never trusted. Objects are stored privately; `WarrantyClaim.imageUrls` holds storage keys
 * and images are served only through `GET /api/v1/claims/{id}/images/{name}` after an access check.
 *
 * Antivirus: images are re-validated by signature only. If you need AV scanning, hook it into
 * `validateClaimImages` (e.g. ClamAV via clamd INSTREAM) before `storeClaimImages`.
 */

export const CLAIM_IMAGE_TYPES = IMAGE_TYPES;
export { sniffImageType };
export type { UploadedFile, ValidatedImage };

export function claimImageLimits() {
  return { maxBytes: Math.round(env().CLAIM_IMAGE_MAX_MB * 1024 * 1024), maxCount: env().CLAIM_IMAGE_MAX_COUNT, types: Object.keys(CLAIM_IMAGE_TYPES) };
}

export async function validateClaimImages(files: UploadedFile[]): Promise<ValidatedImage[]> {
  const { maxBytes, maxCount } = claimImageLimits();
  if (files.length > maxCount) throw badRequest(`Tối đa ${maxCount} ảnh cho mỗi yêu cầu`, "TOO_MANY_IMAGES");
  const out: ValidatedImage[] = [];
  for (const f of files) out.push(await validateImageFile(f, maxBytes));
  return out;
}

/** Writes images to object storage and returns their keys. On failure, already-written objects are removed. */
export async function storeClaimImages(images: ValidatedImage[]): Promise<string[]> {
  const now = new Date();
  const prefix = `claims/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const keys: string[] = [];
  try {
    for (const img of images) {
      const key = `${prefix}/${randomUUID()}.${img.ext}`;
      await storage().put(key, img.body, img.contentType);
      keys.push(key);
    }
  } catch (e) {
    await deleteClaimImages(keys);
    throw e;
  }
  return keys;
}

export async function deleteClaimImages(keys: string[]) {
  await Promise.all(keys.map((k) => storage().delete(k).catch((e) => console.error("[storage] cleanup failed", k, e))));
}

export const imageName = (key: string) => key.split("/").pop()!;
export const claimImageUrl = (claimId: string, key: string) => `/api/v1/claims/${claimId}/images/${imageName(key)}`;

/**
 * Returns one claim image if the caller may see it: claim managers, the laboratory that owns the case,
 * or the verified patient of that warranty code (patient access token).
 */
export async function getClaimImage(claimId: string, name: string, access: { actor: Actor | null; patientCode: string | null }) {
  const claim = await prisma.warrantyClaim.findUnique({
    where: { id: claimId },
    select: { imageUrls: true, warrantyCode: { select: { code: true } }, restorationCase: { select: { laboratoryId: true } } },
  });
  if (!claim) throw notFound();
  const a = access.actor;
  const allowed =
    (a && can(a.role, "claim:manage")) ||
    (a && (a.role === "LAB_ADMIN" || a.role === "LAB_STAFF") && a.laboratoryId === claim.restorationCase.laboratoryId) ||
    (access.patientCode !== null && normalizeCode(access.patientCode) === claim.warrantyCode.code);
  if (!allowed) throw notFound();
  const key = claim.imageUrls.find((k) => imageName(k) === name);
  if (!key) throw notFound();
  const obj = await storage().get(key);
  if (!obj) throw notFound("Ảnh không còn tồn tại");
  return obj;
}

/** Rejects oversized multipart bodies before they are buffered (Content-Length is checked up front). */
export function assertClaimUploadSize(headers: Headers) {
  const { maxBytes, maxCount } = claimImageLimits();
  const length = Number(headers.get("content-length") ?? 0);
  if (length > maxBytes * maxCount + 1024 * 1024) throw badRequest("Dữ liệu tải lên quá lớn", "PAYLOAD_TOO_LARGE");
}

/** Splits a multipart claim submission into its text fields and `images` files. */
export function splitClaimForm(form: FormData) {
  const fields: Record<string, string> = {};
  const files: File[] = [];
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
    else if (k === "images" && v.size > 0) files.push(v);
  }
  return { fields, files };
}
