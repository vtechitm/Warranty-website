import { api } from "@/server/http/handler";
import { getProduct, updateProduct } from "@/server/services/catalog";
import { productUpdateSchema } from "@/server/validation";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => getProduct(actor, params.id));
export const PATCH = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => updateProduct(actor, params.id, await body(productUpdateSchema)));
