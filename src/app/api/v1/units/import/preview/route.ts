import { api } from "@/server/http/handler";
import { badRequest } from "@/server/errors";
import { parseUnitSheet, previewUnitImport } from "@/server/services/unit-import";

/** Upload an .xlsx / .csv of unit allocations (lab code, product SKU, units, invoice) → validated preview. Nothing is written. */
export const POST = api({ auth: "required", permission: "units:manage" }, async ({ actor, form }) => {
  const file = (await form()).get("file");
  if (!(file instanceof File)) throw badRequest("Chọn tệp .xlsx hoặc .csv");
  const rows = await parseUnitSheet(Buffer.from(await file.arrayBuffer()), file.name);
  return { filename: file.name, ...(await previewUnitImport(actor, rows)) };
});
