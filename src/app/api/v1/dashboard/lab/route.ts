import { api } from "@/server/http/handler";
import { labDashboard } from "@/server/services/dashboard";

export const GET = api({ auth: "required" }, async ({ actor }) => labDashboard(actor));
