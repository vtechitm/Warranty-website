import { z } from "zod";
import { api, fileResponse } from "@/server/http/handler";
import { exportBatchLabels } from "@/server/services/exports";
import { LABEL_TEMPLATES, type LabelTemplateId } from "@/server/pdf/labels";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params, query }) => {
  const q = query(z.object({
    template: z.enum(Object.keys(LABEL_TEMPLATES) as [LabelTemplateId, ...LabelTemplateId[]]).default("a4-3x8"),
    serialFrom: z.coerce.number().int().min(1).optional(), serialTo: z.coerce.number().int().min(1).optional(),
    cutLines: z.enum(["0", "1"]).default("1"),
  }));
  const f = await exportBatchLabels(actor, params.id, q.template, q, q.cutLines === "1");
  return fileResponse(f.buffer, f.filename, "application/pdf", true);
});
