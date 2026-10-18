import { api } from "@/server/http/handler";
import { activateWarranty } from "@/server/services/activation";
import { activationSchema } from "@/server/validation";
import { rateLimit } from "@/server/rate-limit";

export const POST = api<{ code: string }>({ auth: "required", permission: "warranty:activate" }, async ({ actor, params, body }) => {
  rateLimit(`activate:user:${actor.userId}`, 60, 60_000);
  return activateWarranty(actor, params.code, await body(activationSchema));
});
