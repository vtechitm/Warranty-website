import { api } from "@/server/http/handler";
import { AppError } from "@/server/errors";
import { submitClaim } from "@/server/services/claims";
import { assertClaimUploadSize, splitClaimForm, validateClaimImages } from "@/server/services/claim-images";
import { PATIENT_ACCESS_COOKIE, readPatientAccessToken } from "@/server/services/passport";
import { claimSchema } from "@/server/validation";
import { rateLimit } from "@/server/rate-limit";

/**
 * Claim submitted by a verified patient from the public page. Never auto-approved.
 * JSON, or multipart/form-data with the same fields plus up to N `images` files (JPEG/PNG/WebP).
 */
export const POST = api<{ code: string }>({ auth: "none" }, async ({ req, params, body, form, ip }) => {
  rateLimit(`public:claim:${ip ?? "unknown"}`, 5, 60 * 60_000);
  const token = req.headers.get("x-patient-access") ?? req.cookies.get(PATIENT_ACCESS_COOKIE)?.value;
  if (!(await readPatientAccessToken(token, params.code))) throw new AppError("UNAUTHENTICATED", "Cần xác thực bệnh nhân");
  let claim;
  if (req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    assertClaimUploadSize(req.headers);
    const { fields, files } = splitClaimForm(await form());
    const input = claimSchema.parse({ ...fields, claimantType: "PATIENT" });
    claim = await submitClaim(null, params.code, input, await validateClaimImages(files));
  } else {
    const input = await body(claimSchema);
    claim = await submitClaim(null, params.code, { ...input, claimantType: "PATIENT" });
  }
  return { claimNumber: claim.claimNumber, status: claim.status, imageCount: claim.imageUrls.length };
});
