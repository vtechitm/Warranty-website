import { api } from "@/server/http/handler";
import { reinstateCode } from "@/server/services/warranty-codes";
import { revokeSchema } from "@/server/validation";

export const POST = api<{ code: string }>({ auth: "required" }, async ({ actor, params, body }) => reinstateCode(actor, params.code.toUpperCase(), (await body(revokeSchema)).reason));
