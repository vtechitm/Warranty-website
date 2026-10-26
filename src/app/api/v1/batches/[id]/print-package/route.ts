import { z } from "zod";
import { api, fileResponse } from "@/server/http/handler";
import { exportBatchPrintPackage } from "@/server/services/exports";

/** ZIP for the print shop: Excel with QR pictures, data-merge CSV, QR PNG + SVG files, printing instructions. */
export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params, query }) => {
  const q = query(z.object({ serialFrom: z.coerce.number().int().min(1).optional(), serialTo: z.coerce.number().int().min(1).optional() }));
  const f = await exportBatchPrintPackage(actor, params.id, q);
  return fileResponse(f.buffer, f.filename, "application/zip");
});
