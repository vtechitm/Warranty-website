import { api } from "@/server/http/handler";
import { confirmInstallation } from "@/server/services/activation";
import { confirmInstallationSchema } from "@/server/validation";

export const POST = api<{ code: string }>({ auth: "required" }, async ({ actor, params, body }) => {
  const { installationDate } = await body(confirmInstallationSchema);
  return confirmInstallation(actor, params.code, installationDate);
});
