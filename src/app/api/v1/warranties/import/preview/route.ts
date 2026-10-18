import { api } from "@/server/http/handler";
import { badRequest } from "@/server/errors";
import { parseAssignmentSheet, previewAssignmentImport } from "@/server/services/assignment-import";

/** Upload an .xlsx / .csv of (code, lab code) rows → validated preview. Nothing is written. */
export const POST = api({ auth: "required", permission: "code:assign" }, async ({ actor, form }) => {
  const file = (await form()).get("file");
  if (!(file instanceof File)) throw badRequest("Chọn tệp .xlsx hoặc .csv");
  const rows = await parseAssignmentSheet(Buffer.from(await file.arrayBuffer()), file.name);
  return { filename: file.name, ...(await previewAssignmentImport(actor, rows)) };
});
