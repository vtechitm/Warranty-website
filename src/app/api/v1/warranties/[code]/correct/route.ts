import { z } from "zod";
import { api } from "@/server/http/handler";
import { correctWarranty } from "@/server/services/activation";

const schema = z.object({
  reason: z.string().trim().min(3).max(500),
  patientName: z.string().trim().min(1).max(120).optional(),
  patientPhone: z.string().trim().max(20).nullable().optional(),
  clinicName: z.string().trim().max(200).nullable().optional(),
  dentistName: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  installationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((s) => new Date(`${s}T00:00:00Z`)).optional(),
  /** Lab-provided warranty duration (months); the end date is recomputed from the start date. */
  warrantyMonths: z.number().int().min(1).max(600).optional(),
});

/** Authorized correction after activation; before/after is written to the audit log. */
export const POST = api<{ code: string }>({ auth: "required" }, async ({ actor, params, body }) => correctWarranty(actor, params.code, await body(schema)));
