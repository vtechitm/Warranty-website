import { z } from "zod";
import { api, fileResponse } from "@/server/http/handler";
import { exportBatchQrZip } from "@/server/services/exports";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params, query }) => {
  const q = query(z.object({ format: z.enum(["png", "svg"]).default("png"), serialFrom: z.coerce.number().int().min(1).optional(), serialTo: z.coerce.number().int().min(1).optional() }));
  const f = await exportBatchQrZip(actor, params.id, q.format, q);
  return fileResponse(f.buffer, f.filename, "application/zip");
});
