import { z } from "zod";
import { api, paginated } from "@/server/http/handler";
import { createAndGenerateBatch, listBatches } from "@/server/services/warranty-codes";
import { batchCreateSchema, paginationSchema } from "@/server/validation";

export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  const q = query(paginationSchema.extend({
    brandId: z.string().uuid().optional(), productId: z.string().uuid().optional(), q: z.string().max(50).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  }));
  const r = await listBatches(actor, q);
  return paginated(r.items, r.total, q.page, q.pageSize);
});
/** Creates a batch and generates its codes (inline up to 2,000; larger batches run in the background — poll GET /batches/{id}). */
export const POST = api({ auth: "required" }, async ({ actor, body }) => createAndGenerateBatch(actor, await body(batchCreateSchema)));
