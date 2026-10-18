import { z } from "zod";
import { api } from "@/server/http/handler";
import { prisma } from "@/server/db";

const schema = z.object({
  emailEnabled: z.boolean().optional(), smsEnabled: z.boolean().optional(), zaloEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(), warrantyReminders: z.boolean().optional(),
});

export const GET = api({ auth: "required" }, async ({ actor }) =>
  prisma.notificationPreference.upsert({ where: { userId: actor.userId }, create: { userId: actor.userId }, update: {} }));
export const PUT = api({ auth: "required" }, async ({ actor, body }) => {
  const data = await body(schema);
  return prisma.notificationPreference.upsert({ where: { userId: actor.userId }, create: { userId: actor.userId, ...data }, update: data });
});
