import { api } from "@/server/http/handler";
import { getBrand, updateBrand } from "@/server/services/catalog";
import { brandUpdateSchema } from "@/server/validation";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => getBrand(actor, params.id));
export const PATCH = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => updateBrand(actor, params.id, await body(brandUpdateSchema)));
