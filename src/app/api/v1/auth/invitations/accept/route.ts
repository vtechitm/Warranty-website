import { api } from "@/server/http/handler";
import { acceptInvitation } from "@/server/auth/auth-service";
import { acceptInviteSchema } from "@/server/validation";

export const POST = api({ auth: "none" }, async ({ body, ip, userAgent }) => {
  const input = await body(acceptInviteSchema);
  return acceptInvitation(input.token, input.password, { ip, userAgent });
});
