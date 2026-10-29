import { z } from "zod";
import { api } from "@/server/http/handler";
import { allocateUnits, listUnitBalances } from "@/server/services/units";
import { unitAllocationSchema } from "@/server/validation";

/** Tooth-unit balances per laboratory × product (labs: their own). */
export const GET = api({ auth: "required" }, async ({ actor, query }) =>
  listUnitBalances(actor, query(z.object({ laboratoryId: z.string().uuid().optional(), productId: z.string().uuid().optional() }))),
);

/** Allocate (sale) or adjust a laboratory's tooth units for a product. Super admin. */
export const POST = api({ auth: "required", permission: "units:manage" }, async ({ actor, body }) => allocateUnits(actor, await body(unitAllocationSchema)));
