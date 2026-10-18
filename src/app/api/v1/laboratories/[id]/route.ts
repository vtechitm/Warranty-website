import { api } from "@/server/http/handler";
import { getLaboratory, updateLaboratory } from "@/server/services/laboratories";
import { laboratoryUpdateSchema } from "@/server/validation";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => getLaboratory(actor, params.id));
export const PATCH = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => updateLaboratory(actor, params.id, await body(laboratoryUpdateSchema)));
