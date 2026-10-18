import { z } from "zod";
import { api } from "@/server/http/handler";
import { setStaffStatus } from "@/server/services/laboratories";
import { setUserStatus } from "@/server/services/users";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";

export const POST = api<{ id: string }>({ auth: "required" }, async ({ actor, params, body }) => {
  const { status } = await body(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }));
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) throw notFound();
  if (user.laboratoryId) await setStaffStatus(actor, params.id, status);
  else await setUserStatus(actor, params.id, status);
  return { ok: true };
});
