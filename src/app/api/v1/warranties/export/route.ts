import { api, fileResponse } from "@/server/http/handler";
import { exportWarrantiesXlsx } from "@/server/services/exports";
import { warrantySearchSchema } from "@/server/validation";
import { assertCan } from "@/server/auth/permissions";

export const GET = api({ auth: "required" }, async ({ actor, query }) => {
  if (actor.role !== "LAB_ADMIN") assertCan(actor, "report:export");
  const f = await exportWarrantiesXlsx(actor, query(warrantySearchSchema));
  return fileResponse(f.buffer, f.filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});
