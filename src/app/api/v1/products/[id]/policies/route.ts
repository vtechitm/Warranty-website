import { api } from "@/server/http/handler";
import { getProduct, publishPolicyVersion } from "@/server/services/catalog";
import { policySchema } from "@/server/validation";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => (await getProduct(actor, params.id)).policies);
/** Publishes a new policy version; existing warranties keep their activation-time snapshot. */
export const POST = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => publishPolicyVersion(actor, params.id, await body(policySchema)));
