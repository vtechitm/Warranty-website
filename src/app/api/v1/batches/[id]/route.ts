import { api } from "@/server/http/handler";
import { getBatch } from "@/server/services/warranty-codes";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => getBatch(actor, params.id));
