import { api } from "@/server/http/handler";
import { prisma } from "@/server/db";
import { revokeSession } from "@/server/auth/auth-service";
import { notFound } from "@/server/errors";

export const DELETE = api<{ id: string }>({ auth: "required" }, async ({ actor, params }) => {
  const s = await prisma.deviceSession.findUnique({ where: { id: params.id } });
  if (!s || s.userId !== actor.userId) throw notFound();
  await revokeSession(s.id);
  return { ok: true };
});
