import { api } from "@/server/http/handler";
import { changePassword } from "@/server/auth/auth-service";
import { changePasswordSchema } from "@/server/validation";

export const POST = api({ auth: "required" }, async ({ actor, body }) => {
  const input = await body(changePasswordSchema);
  await changePassword(actor, input.currentPassword, input.newPassword);
  return { ok: true };
});
