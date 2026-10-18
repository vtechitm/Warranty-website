import { z } from "zod";
import { api } from "@/server/http/handler";
import { setSuspension } from "@/server/services/activation";

export const POST = api<{ code: string }>({ auth: "required" }, async ({ actor, params, body }) => {
  const input = await body(z.object({ suspended: z.boolean(), reason: z.string().trim().min(3).max(500) }));
  await setSuspension(actor, params.code, input.suspended, input.reason);
  return { ok: true };
});
