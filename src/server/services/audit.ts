import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import type { Actor } from "../auth/permissions";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  laboratoryId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/** Append an audit record. Pass `tx` to make it part of the same transaction as the change. */
export async function audit(actor: Actor | null, input: AuditInput, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      actorId: actor?.userId ?? null,
      actorRole: actor?.role ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      laboratoryId: input.laboratoryId ?? actor?.laboratoryId ?? null,
      metadata: input.metadata ?? {},
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent?.slice(0, 300) ?? null,
    },
  });
}

export async function listAuditLogs(params: { page: number; pageSize: number; entityType?: string; action?: string; entityId?: string }) {
  const where: Prisma.AuditLogWhereInput = {
    entityType: params.entityType || undefined,
    action: params.action ? { contains: params.action } : undefined,
    entityId: params.entityId || undefined,
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
