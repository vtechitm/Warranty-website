import { api } from "@/server/http/handler";
import { getPublicPassport } from "@/server/services/passport";
import { notFound } from "@/server/errors";

/** Public, privacy-safe passport for the QR landing page / brand websites / apps. */
export const GET = api<{ code: string }>({ auth: "none" }, async ({ params, ip }) => {
  const p = await getPublicPassport(params.code, ip);
  if (!p) throw notFound("Mã bảo hành không tồn tại");
  return p;
});
