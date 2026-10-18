import { api } from "@/server/http/handler";
import { checkCodeForActivation } from "@/server/services/activation";

/** Pre-activation check: code exists, belongs to caller's lab, not activated / revoked. */
export const GET = api<{ code: string }>({ auth: "required" }, async ({ actor, params }) => checkCodeForActivation(actor, params.code));
