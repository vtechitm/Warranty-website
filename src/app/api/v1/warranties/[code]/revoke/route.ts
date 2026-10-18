import { api } from "@/server/http/handler";
import { revokeCode } from "@/server/services/warranty-codes";
import { revokeSchema } from "@/server/validation";

export const POST = api<{ code: string }>({ auth: "required" }, async ({ actor, params, body }) => revokeCode(actor, params.code.toUpperCase(), (await body(revokeSchema)).reason));
