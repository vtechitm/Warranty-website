import { api } from "@/server/http/handler";
import { listSessions } from "@/server/auth/auth-service";

/** Device session management (web + mobile). */
export const GET = api({ auth: "required" }, async ({ actor }) => {
  const sessions = await listSessions(actor.userId);
  return sessions.map((s) => ({ ...s, current: s.id === actor.sessionId }));
});
