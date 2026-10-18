import { api } from "@/server/http/handler";
import { resendInvitation } from "@/server/services/laboratories";

/** Issues a new invitation link (previous links are invalidated). */
export const POST = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => resendInvitation(actor, params.id));
