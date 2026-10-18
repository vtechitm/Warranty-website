import { api } from "@/server/http/handler";
import { verifyBrandDomain } from "@/server/services/catalog";

export const POST = api<{ domainId: string }>({ auth: "required" }, async ({ actor, params }) => verifyBrandDomain(actor, params.domainId));
