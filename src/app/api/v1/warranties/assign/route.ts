import { api } from "@/server/http/handler";
import { assignCodes } from "@/server/services/warranty-codes";
import { assignSchema } from "@/server/validation";

export const POST = api({ auth: "required" }, async ({ actor, body }) => assignCodes(actor, await body(assignSchema)));
