import { NextResponse } from "next/server";
import { api } from "@/server/http/handler";
import { revokeSession, WEB_SESSION_COOKIE } from "@/server/auth/auth-service";

export const POST = api({ auth: "optional" }, async ({ actor }) => {
  if (actor) await revokeSession(actor.sessionId);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(WEB_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
