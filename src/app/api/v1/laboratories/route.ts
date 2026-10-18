import { z } from "zod";
import { api, paginated } from "@/server/http/handler";
import { createLaboratory, listLaboratories } from "@/server/services/laboratories";
import { laboratorySchema, paginationSchema } from "@/server/validation";

export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  const q = query(paginationSchema.extend({ q: z.string().max(100).optional() }));
  const r = await listLaboratories(actor, q);
  return paginated(r.items, r.total, q.page, q.pageSize);
});
/** Creates a lab and (optionally) its admin user. Returns a one-time invitation link — no passwords are emailed. */
export const POST = api({ auth: "required" }, async ({ actor, body }) => createLaboratory(actor, await body(laboratorySchema)));
