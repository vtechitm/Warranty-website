import { api } from "@/server/http/handler";
import { listPatientWarranties } from "@/server/services/passport";

/** Mobile: "My Warranties" for a patient account (verified links only). */
export const GET = api({ auth: "required", permission: "patient-portal" }, async ({ actor }) => listPatientWarranties(actor));
