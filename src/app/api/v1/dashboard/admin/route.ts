import { z } from "zod";
import { api } from "@/server/http/handler";
import { adminDashboard } from "@/server/services/dashboard";

export const GET = api({ auth: "required" }, async ({ actor, query }) => adminDashboard(actor, query(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }))));
