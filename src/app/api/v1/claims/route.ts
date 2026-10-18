import { z } from "zod";
import { api, paginated } from "@/server/http/handler";
import { listClaims } from "@/server/services/claims";
import { paginationSchema } from "@/server/validation";

export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  const q = query(paginationSchema.extend({ status: z.enum(["SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED", "COMPLETED"]).optional() }));
  const r = await listClaims(actor, q);
  return paginated(r.items, r.total, q.page, q.pageSize);
});
