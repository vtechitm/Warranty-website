import { z } from "zod";
import { api } from "@/server/http/handler";
import { searchClinics } from "@/server/services/laboratories";

export const GET = api({ auth: "required" }, async ({ actor, query }) => searchClinics(actor, query(z.object({ q: z.string().max(100).optional() })).q));
