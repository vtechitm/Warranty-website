import { api } from "@/server/http/handler";

export const GET = api({ auth: "required" }, async ({ actor }) => ({
  id: actor.userId, name: actor.name, email: actor.email, role: actor.role, laboratoryId: actor.laboratoryId, clinicId: actor.clinicId, brandIds: actor.brandIds,
}));
