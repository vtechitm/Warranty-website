import { api, fileResponse } from "@/server/http/handler";
import { certificatePdf } from "@/server/services/certificates";
import { PATIENT_ACCESS_COOKIE, readPatientAccessToken } from "@/server/services/passport";

/** Certificate PDF for the public / verified patient. Patient section is included only when verified. */
export const GET = api<{ code: string }>({ auth: "none" }, async ({ req, params, ip }) => {
  const token = req.headers.get("x-patient-access") ?? req.cookies.get(PATIENT_ACCESS_COOKIE)?.value;
  const verifiedPatient = await readPatientAccessToken(token, params.code);
  const { data, pdf } = await certificatePdf(params.code, { verifiedPatient, ip });
  return fileResponse(pdf, `chung-nhan-${data.code}.pdf`, "application/pdf", true);
});
