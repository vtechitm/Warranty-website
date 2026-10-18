import { z } from "zod";
import { api } from "@/server/http/handler";
import { unassignCodes } from "@/server/services/warranty-codes";

export const POST = api({ auth: "required" }, async ({ actor, body }) => {
  const { codes } = await body(z.object({ codes: z.array(z.string().trim().toUpperCase()).min(1).max(10_000) }));
  return unassignCodes(actor, codes);
});
