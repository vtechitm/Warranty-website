import { api } from "@/server/http/handler";
import { addBrandDomain } from "@/server/services/catalog";
import { brandDomainSchema } from "@/server/validation";

export const POST = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => addBrandDomain(actor, params.id, await body(brandDomainSchema)));
