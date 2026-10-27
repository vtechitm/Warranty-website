import { api } from "@/server/http/handler";
import { badRequest } from "@/server/errors";
import { BRAND_ASSET_MAX_BYTES, uploadBrandAsset } from "@/server/services/brand-landing";

/** Upload one brand page image (multipart field `file`, JPEG/PNG/WebP ≤ 5 MB). Returns its public URL. */
export const POST = api<{ id: string }>({ auth: "required" }, async ({ req, actor, params, form }) => {
  if (Number(req.headers.get("content-length") ?? 0) > BRAND_ASSET_MAX_BYTES + 512 * 1024) throw badRequest("Ảnh vượt quá 5 MB", "IMAGE_TOO_LARGE");
  const file = (await form()).get("file");
  if (!(file instanceof File)) throw badRequest("Chọn một tệp ảnh");
  return uploadBrandAsset(actor, params.id, file);
});
