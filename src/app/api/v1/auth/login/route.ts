import { NextResponse } from "next/server";
import { api } from "@/server/http/handler";
import { login, WEB_SESSION_COOKIE } from "@/server/auth/auth-service";
import { loginSchema } from "@/server/validation";

/** POST /api/v1/auth/login — web: sets an httpOnly session cookie; mobile: returns access + refresh tokens. */
export const POST = api({ auth: "none" }, async ({ body, ip, userAgent }) => {
  const input = await body(loginSchema);
  const result = await login({ email: input.email, password: input.password, kind: input.client === "mobile" ? "MOBILE" : "WEB", ip, userAgent, deviceName: input.deviceName });
  if (result.kind === "WEB") {
    const res = NextResponse.json({ data: { user: result.user, expiresAt: result.expiresAt } });
    res.cookies.set(WEB_SESSION_COOKIE, result.sessionToken, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: result.expiresAt,
    });
    return res;
  }
  return { user: result.user, accessToken: result.accessToken, accessTokenExpiresAt: result.accessTokenExpiresAt, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt, tokenType: "Bearer" };
});
