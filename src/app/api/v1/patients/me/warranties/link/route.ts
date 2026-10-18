import { z } from "zod";
import { api } from "@/server/http/handler";
import { linkWarrantyToPatient } from "@/server/services/passport";

/** Mobile: link a warranty to the patient account using the code + access code printed on the certificate. */
export const POST = api({ auth: "required", permission: "patient-portal" }, async ({ actor, body }) => {
  const input = await body(z.object({ code: z.string().min(5).max(40), accessCode: z.string().min(6).max(20) }));
  return linkWarrantyToPatient(actor, input.code, input.accessCode);
});
