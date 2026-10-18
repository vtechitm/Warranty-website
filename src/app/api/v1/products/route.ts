import { z } from "zod";
import { api } from "@/server/http/handler";
import { createProduct, listProducts } from "@/server/services/catalog";
import { policySchema, productSchema } from "@/server/validation";

export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  const q = query(z.object({ brandId: z.string().uuid().optional() }));
  return listProducts(actor, q);
});
export const POST = api({ auth: "required" }, async ({ actor, body }) => {
  const input = await body(productSchema.extend({ policy: policySchema.optional() }));
  const { policy, ...product } = input;
  return createProduct(actor, product, policy);
});
