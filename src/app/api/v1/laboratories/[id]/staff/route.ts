import { api } from "@/server/http/handler";
import { inviteStaff, listStaff } from "@/server/services/laboratories";
import { staffSchema } from "@/server/validation";

export const GET = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => listStaff(actor, params.id));
export const POST = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => inviteStaff(actor, params.id, await body(staffSchema)));
