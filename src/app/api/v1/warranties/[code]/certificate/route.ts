import { api, fileResponse } from "@/server/http/handler";
import { certificatePdf } from "@/server/services/certificates";

/** Full certificate PDF (with patient section + access code) for the owning lab / admin. */
export const GET = api<{ code: string }>({ auth: "required" }, async ({ actor, params, ip }) => {
  const { data, pdf } = await certificatePdf(params.code, { actor, ip });
  return fileResponse(pdf, `chung-nhan-${data.code}.pdf`, "application/pdf", true);
});
