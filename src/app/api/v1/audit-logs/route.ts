import { z } from "zod";
import { api, paginated } from "@/server/http/handler";
import { listAuditLogs } from "@/server/services/audit";
import { paginationSchema } from "@/server/validation";

export const GET = api({ auth: "required", permission: "audit:read" }, async ({ query }) => {
  const q = query(paginationSchema.extend({ entityType: z.string().max(50).optional(), action: z.string().max(50).optional(), entityId: z.string().max(60).optional() }));
  const r = await listAuditLogs(q);
  return paginated(r.items, r.total, q.page, q.pageSize);
});
