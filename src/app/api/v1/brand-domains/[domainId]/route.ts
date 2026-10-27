import { api } from "@/server/http/handler";
import { removeBrandDomain, updateBrandDomain } from "@/server/services/catalog";
import { brandDomainOptionsSchema } from "@/server/validation";

/** Make primary / redirect to primary (super admin, or brand admin for own brands). */
export const PATCH = api<{ domainId: string }>({ auth: "required" }, async ({ actor, params, body }) => updateBrandDomain(actor, params.domainId, await body(brandDomainOptionsSchema)));

export const DELETE = api<{ domainId: string }>({ auth: "required" }, async ({ actor, params }) => {
  await removeBrandDomain(actor, params.domainId);
  return { ok: true };
});
