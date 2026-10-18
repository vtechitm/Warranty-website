import { api } from "@/server/http/handler";
import { AppError } from "@/server/errors";
import { getPrivatePassport, PATIENT_ACCESS_COOKIE, readPatientAccessToken } from "@/server/services/passport";

/** Private restoration details — only after patient verification. */
export const GET = api<{ code: string }>({ auth: "none" }, async ({ req, params }) => {
  const token = req.headers.get("x-patient-access") ?? req.cookies.get(PATIENT_ACCESS_COOKIE)?.value;
  if (!(await readPatientAccessToken(token, params.code))) throw new AppError("UNAUTHENTICATED", "Cần xác thực bệnh nhân");
  return getPrivatePassport(params.code);
});
