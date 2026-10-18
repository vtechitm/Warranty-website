import { api } from "@/server/http/handler";
import { getWarrantyDetail } from "@/server/services/activation";

/** Full record for authorized staff (admin, owning lab, linked clinic). */
export const GET = api<{ code: string }>({ auth: "required" }, async ({ actor, params }) => getWarrantyDetail(actor, params.code));
