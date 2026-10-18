import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { actorFromWebToken, WEB_SESSION_COOKIE } from "./auth-service";
import type { Actor } from "./permissions";
import { clientIp } from "../http/handler";

/** Current actor for Server Components (web cookie session). */
export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(WEB_SESSION_COOKIE)?.value;
  const h = await headers();
  return actorFromWebToken(token, { ip: clientIp(h), userAgent: h.get("user-agent") });
}

export async function requireActor(roles: Role[], next?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!roles.includes(actor.role)) redirect(homeFor(actor.role));
  return actor;
}

export function homeFor(role: Role) {
  switch (role) {
    case "SUPER_ADMIN":
    case "BRAND_ADMIN":
      return "/admin";
    case "LAB_ADMIN":
    case "LAB_STAFF":
      return "/lab";
    default:
      return "/";
  }
}
