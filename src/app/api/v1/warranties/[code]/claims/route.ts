import { api } from "@/server/http/handler";
import { submitClaim } from "@/server/services/claims";
import { assertClaimUploadSize, splitClaimForm, validateClaimImages } from "@/server/services/claim-images";
import { claimSchema } from "@/server/validation";

/** JSON, or multipart/form-data with the same fields plus up to N `images` files. */
export const POST = api<{ code: string }>({ auth: "required" }, async ({ req, actor, params, body, form }) => {
  if (req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    assertClaimUploadSize(req.headers);
    const { fields, files } = splitClaimForm(await form());
    const input = claimSchema.parse(fields);
    return submitClaim(actor, params.code, input, await validateClaimImages(files));
  }
  return submitClaim(actor, params.code, await body(claimSchema));
});
