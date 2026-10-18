import { api } from "@/server/http/handler";
import { requestPatientOtp } from "@/server/services/passport";
import { otpRequestSchema } from "@/server/validation";

/** Send a one-time code to the phone registered at activation (caller must type that phone). Then verify with method PHONE_OTP. */
export const POST = api<{ code: string }>({ auth: "none" }, async ({ params, body, ip }) => {
  const input = await body(otpRequestSchema);
  return requestPatientOtp(params.code, input.phone, ip);
});
