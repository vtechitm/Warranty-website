import { api } from "@/server/http/handler";
import { updateClaimStatus } from "@/server/services/claims";
import { claimStatusSchema } from "@/server/validation";

export const POST = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => {
  const input = await body(claimStatusSchema);
  return updateClaimStatus(actor, params.id, input.status, input.note);
});
