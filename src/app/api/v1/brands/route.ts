import { api } from "@/server/http/handler";
import { createBrand, listBrands } from "@/server/services/catalog";
import { brandSchema } from "@/server/validation";

export const GET = api({ auth: "required" }, async ({ actor }) => listBrands(actor));
export const POST = api({ auth: "required" }, async ({ actor, body }) => createBrand(actor, await body(brandSchema)));
