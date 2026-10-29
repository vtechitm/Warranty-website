import { api, paginated } from "@/server/http/handler";
import { listUnitLedger } from "@/server/services/units";
import { unitFilterSchema } from "@/server/validation";

/** Tooth-unit history: allocations, activations, refunds, adjustments (labs: their own). */
export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  const q = query(unitFilterSchema);
  const r = await listUnitLedger(actor, q);
  return paginated(r.items, r.total, q.page, q.pageSize);
});
