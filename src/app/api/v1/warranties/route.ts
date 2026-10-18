import { api, paginated } from "@/server/http/handler";
import { searchCodes } from "@/server/services/warranty-codes";
import { warrantySearchSchema } from "@/server/validation";

/** Search warranty codes within the caller's scope (labs only see their own codes). */
export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  const q = query(warrantySearchSchema);
  const r = await searchCodes(actor, q);
  return paginated(r.items, r.total, q.page, q.pageSize);
});
