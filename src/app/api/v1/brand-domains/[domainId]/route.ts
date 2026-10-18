import { api } from "@/server/http/handler";
import { removeBrandDomain } from "@/server/services/catalog";

export const DELETE = api<{ domainId: string }>({ auth: "required" }, async ({ actor, params }) => {
  await removeBrandDomain(actor, params.domainId);
  return { ok: true };
});
