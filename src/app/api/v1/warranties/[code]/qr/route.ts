import { z } from "zod";
import { api } from "@/server/http/handler";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { assertBrandAccess, assertCan } from "@/server/auth/permissions";
import { qrPng, qrSvg, warrantyUrl } from "@/server/services/qr";
import { normalizeCode } from "@/server/services/warranty-codes";

/** QR image for one code (PNG or SVG). */
export const GET = api<{ code: string }>({ auth: "required" }, async ({ actor, params, query }) => {
  const { format, size } = query(z.object({ format: z.enum(["png", "svg"]).default("png"), size: z.coerce.number().int().min(100).max(2000).default(600) }));
  const wc = await prisma.warrantyCode.findUnique({ where: { code: normalizeCode(params.code) }, include: { batch: true, case: { select: { laboratoryId: true } } } });
  if (!wc) throw notFound();
  if (actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF") {
    if (wc.case?.laboratoryId !== actor.laboratoryId) throw notFound();
  } else {
    assertCan(actor, "code:read-all");
    assertBrandAccess(actor, wc.brandId);
  }
  const url = warrantyUrl(wc.batch.qrBaseUrl, wc.code);
  if (format === "svg") return new Response(await qrSvg(url), { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${wc.code}.svg"` } });
  return new Response(new Uint8Array(await qrPng(url, size)), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${wc.code}.png"` } });
});
