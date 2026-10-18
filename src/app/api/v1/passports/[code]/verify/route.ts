import { NextResponse } from "next/server";
import { api } from "@/server/http/handler";
import { PATIENT_ACCESS_COOKIE, verifyPatientAccess } from "@/server/services/passport";
import { patientVerifySchema } from "@/server/validation";

/** Patient identity verification. Web: sets a short-lived httpOnly cookie. Apps: send the returned token as X-Patient-Access. */
export const POST = api<{ code: string }>({ auth: "none" }, async ({ params, body, ip }) => {
  const input = await body(patientVerifySchema);
  const r = await verifyPatientAccess(params.code, input.method, input.value, ip);
  const res = NextResponse.json({ data: { verified: true, token: r.token, expiresInSeconds: r.expiresInSeconds } });
  res.cookies.set(PATIENT_ACCESS_COOKIE, r.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: r.expiresInSeconds });
  return res;
});
