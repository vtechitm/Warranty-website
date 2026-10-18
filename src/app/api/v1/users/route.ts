import { api } from "@/server/http/handler";
import { createSystemUser, listSystemUsers, systemUserSchema } from "@/server/services/users";

export const GET = api({ auth: "required" }, async ({ actor }) => listSystemUsers(actor));
export const POST = api({ auth: "required" }, async ({ actor, body }) => createSystemUser(actor, await body(systemUserSchema)));
