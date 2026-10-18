import { api } from "@/server/http/handler";
import { getClaimImage } from "@/server/services/claim-images";
import { PATIENT_ACCESS_COOKIE, patientCodeFromToken } from "@/server/services/passport";

/** A claim photo — for claim managers, the owning laboratory, or the verified patient (X-Patient-Access / cookie). */
export const GET = api<{ id: string; name: string }>({ auth: "optional" }, async ({ req, params, actor }) => {
  const token = req.headers.get("x-patient-access") ?? req.cookies.get(PATIENT_ACCESS_COOKIE)?.value;
  const img = await getClaimImage(params.id, params.name, { actor, patientCode: actor ? null : await patientCodeFromToken(token) });
  return new Response(new Uint8Array(img.body), {
    headers: {
      "Content-Type": img.contentType,
      "Content-Length": String(img.body.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
