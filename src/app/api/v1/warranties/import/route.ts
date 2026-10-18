import { api } from "@/server/http/handler";
import { confirmAssignmentImport } from "@/server/services/assignment-import";
import { assignmentImportSchema } from "@/server/validation";

/** Confirm a previewed import: re-validates all rows, then assigns per laboratory via assignCodes(). */
export const POST = api({ auth: "required", permission: "code:assign" }, async ({ actor, body }) => {
  const input = await body(assignmentImportSchema);
  return confirmAssignmentImport(actor, input.rows, input.note, input.filename);
});
