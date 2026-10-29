import { api } from "@/server/http/handler";
import { confirmUnitImport } from "@/server/services/unit-import";
import { unitImportSchema } from "@/server/validation";

/** Confirm a previewed import: re-validates every row, then applies all allocations in one transaction. */
export const POST = api({ auth: "required", permission: "units:manage" }, async ({ actor, body }) => {
  const input = await body(unitImportSchema);
  return confirmUnitImport(actor, input.rows, input.note, input.filename);
});
