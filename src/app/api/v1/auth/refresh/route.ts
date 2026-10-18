import { api } from "@/server/http/handler";
import { refreshMobileSession } from "@/server/auth/auth-service";
import { refreshSchema } from "@/server/validation";

/** POST /api/v1/auth/refresh — mobile refresh-token rotation (single use). */
export const POST = api({ auth: "none" }, async ({ body, ip, userAgent }) => {
  const { refreshToken } = await body(refreshSchema);
  return { ...(await refreshMobileSession(refreshToken, { ip, userAgent })), tokenType: "Bearer" };
});
