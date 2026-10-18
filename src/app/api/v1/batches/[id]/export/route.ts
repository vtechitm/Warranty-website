import { api, fileResponse } from "@/server/http/handler";
import { exportBatchXlsx } from "@/server/services/exports";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => {
  const f = await exportBatchXlsx(actor, params.id);
  return fileResponse(f.buffer, f.filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});
