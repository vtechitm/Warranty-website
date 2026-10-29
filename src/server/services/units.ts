import type { Prisma, UnitEntryKind } from "@prisma/client";
import { prisma } from "../db";
import { AppError, conflict, notFound } from "../errors";
import { assertCan, requireLab, type Actor } from "../auth/permissions";
import { audit } from "./audit";

/**
 * Tooth units. Vtech sells blanks to laboratories as tooth units per product (phôi). Cards (codes) are printed
 * in bulk and handed out freely; a lab can only activate a card while it still has units of that card's product.
 *
 * Every movement is one `UnitLedgerEntry` (append-only) and keeps `UnitBalance` in step inside the same
 * transaction. Consumption is a conditional `UPDATE … WHERE balance >= n`, and the table has a CHECK
 * (balance >= 0), so concurrent activations can never overspend.
 */

type Tx = Prisma.TransactionClient;

export const insufficientUnits = (productName: string, available: number, needed: number) =>
  new AppError(
    "CONFLICT",
    `Labo đã hết đơn vị răng cho phôi ${productName} (còn ${available}, cần ${needed}). Liên hệ Vtech để mua thêm phôi.`,
    { available, needed },
    "INSUFFICIENT_UNITS",
  );

async function record(
  tx: Tx,
  e: { laboratoryId: string; productId: string; kind: UnitEntryKind; delta: number; caseId?: string | null; reference?: string | null; note?: string | null; actorId?: string | null },
) {
  let balance: number;
  if (e.delta < 0) {
    const n = -e.delta;
    const updated = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE "UnitBalance" SET "balance" = "balance" - ${n}, "updatedAt" = now()
      WHERE "laboratoryId" = ${e.laboratoryId}::uuid AND "productId" = ${e.productId}::uuid AND "balance" >= ${n}
      RETURNING "balance"`;
    if (updated.length === 0) {
      const row = await tx.unitBalance.findUnique({ where: { laboratoryId_productId: { laboratoryId: e.laboratoryId, productId: e.productId } } });
      const product = await tx.product.findUnique({ where: { id: e.productId }, select: { name: true } });
      throw insufficientUnits(product?.name ?? "", row?.balance ?? 0, n);
    }
    balance = updated[0].balance;
  } else {
    const row = await tx.unitBalance.upsert({
      where: { laboratoryId_productId: { laboratoryId: e.laboratoryId, productId: e.productId } },
      create: { laboratoryId: e.laboratoryId, productId: e.productId, balance: e.delta },
      update: { balance: { increment: e.delta } },
    });
    balance = row.balance;
  }
  return tx.unitLedgerEntry.create({
    data: {
      laboratoryId: e.laboratoryId, productId: e.productId, kind: e.kind, delta: e.delta, balanceAfter: balance,
      restorationCaseId: e.caseId ?? null, reference: e.reference ?? null, note: e.note ?? null, actorId: e.actorId ?? null,
    },
  });
}

/** Units a case currently holds = −(sum of its ledger entries). 0 for cases activated before tooth units existed. */
export async function unitsHeldByCase(tx: Tx, caseId: string) {
  const r = await tx.unitLedgerEntry.aggregate({ where: { restorationCaseId: caseId }, _sum: { delta: true } });
  return -(r._sum.delta ?? 0);
}

/** Activation: consume `units` of the card's product (throws INSUFFICIENT_UNITS). */
export function consumeForActivation(tx: Tx, a: { laboratoryId: string; productId: string; caseId: string; units: number; actorId: string; code: string }) {
  return record(tx, { laboratoryId: a.laboratoryId, productId: a.productId, kind: "ACTIVATION", delta: -a.units, caseId: a.caseId, actorId: a.actorId, note: `Kích hoạt ${a.code}` });
}

/**
 * Brings what a case holds to `target` units: consumes the difference (may throw INSUFFICIENT_UNITS) or refunds it.
 * Used for unit-count corrections, revocation (target 0) and reinstatement.
 */
export async function settleCaseUnits(tx: Tx, c: { caseId: string; laboratoryId: string; productId: string }, target: number, actorId: string | null, note: string) {
  const held = await unitsHeldByCase(tx, c.caseId);
  const diff = target - held;
  if (diff === 0) return null;
  return record(tx, { laboratoryId: c.laboratoryId, productId: c.productId, kind: diff > 0 ? "ACTIVATION" : "REFUND", delta: -diff, caseId: c.caseId, actorId, note });
}

/** Vtech grants (sale) or corrects a lab's units for a product. Negative adjustments cannot go below zero. */
export async function allocateUnits(
  actor: Actor,
  input: { laboratoryId: string; productId: string; units: number; kind: "ALLOCATION" | "ADJUSTMENT"; reference: string | null; note: string | null },
  tx?: Tx,
) {
  assertCan(actor, "units:manage");
  if (!Number.isInteger(input.units) || input.units === 0) throw new AppError("VALIDATION_ERROR", "Số đơn vị phải là số nguyên khác 0");
  if (input.kind === "ALLOCATION" && input.units < 0) throw new AppError("VALIDATION_ERROR", "Cấp đơn vị phải là số dương — dùng Điều chỉnh để giảm");
  const run = async (t: Tx) => {
    const [lab, product] = await Promise.all([
      t.laboratory.findFirst({ where: { id: input.laboratoryId, deletedAt: null }, include: { brands: true } }),
      t.product.findFirst({ where: { id: input.productId, deletedAt: null } }),
    ]);
    if (!lab) throw notFound("Labo không tồn tại");
    if (!product) throw notFound("Sản phẩm không tồn tại");
    if (!lab.brands.some((b) => b.brandId === product.brandId)) throw conflict("Labo chưa được ủy quyền cho thương hiệu của phôi này");
    const entry = await record(t, { laboratoryId: lab.id, productId: product.id, kind: input.kind, delta: input.units, reference: input.reference, note: input.note, actorId: actor.userId });
    await audit(actor, {
      action: input.kind === "ALLOCATION" ? "units.allocate" : "units.adjust", entityType: "Laboratory", entityId: lab.id, laboratoryId: lab.id,
      metadata: { product: product.sku, units: input.units, balanceAfter: entry.balanceAfter, reference: input.reference },
    }, t);
    return { ...entry, laboratory: { code: lab.code, name: lab.name }, product: { sku: product.sku, name: product.name } };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** Balances with totals per (lab, product). Labs see only their own; Vtech sees all (optionally filtered). */
export async function listUnitBalances(actor: Actor, filter: { laboratoryId?: string; productId?: string } = {}) {
  const isLab = actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF";
  const laboratoryId = isLab ? requireLab(actor) : filter.laboratoryId;
  if (!isLab) assertCan(actor, "units:read");
  const where = { laboratoryId, productId: filter.productId };
  const [balances, sums] = await Promise.all([
    prisma.unitBalance.findMany({
      where,
      include: { laboratory: { select: { id: true, code: true, name: true } }, product: { select: { id: true, sku: true, name: true, brand: { select: { name: true } } } } },
      orderBy: [{ laboratory: { code: "asc" } }, { product: { name: "asc" } }],
    }),
    prisma.unitLedgerEntry.groupBy({ by: ["laboratoryId", "productId", "kind"], where, _sum: { delta: true } }),
  ]);
  const total = (labId: string, productId: string, kinds: UnitEntryKind[]) =>
    sums.filter((s) => s.laboratoryId === labId && s.productId === productId && kinds.includes(s.kind)).reduce((a, s) => a + (s._sum.delta ?? 0), 0);
  return balances.map((b) => ({
    laboratory: b.laboratory,
    product: b.product,
    balance: b.balance,
    allocated: total(b.laboratoryId, b.productId, ["ALLOCATION", "ADJUSTMENT"]),
    used: -total(b.laboratoryId, b.productId, ["ACTIVATION", "REFUND"]),
    updatedAt: b.updatedAt,
  }));
}

/** Units available to the acting lab for one product (0 when never allocated). */
export async function labBalance(laboratoryId: string, productId: string) {
  const row = await prisma.unitBalance.findUnique({ where: { laboratoryId_productId: { laboratoryId, productId } } });
  return row?.balance ?? 0;
}

export async function listUnitLedger(actor: Actor, params: { laboratoryId?: string; productId?: string; page: number; pageSize: number }) {
  const isLab = actor.role === "LAB_ADMIN" || actor.role === "LAB_STAFF";
  const laboratoryId = isLab ? requireLab(actor) : params.laboratoryId;
  if (!isLab) assertCan(actor, "units:read");
  const where = { laboratoryId, productId: params.productId };
  const [items, total] = await Promise.all([
    prisma.unitLedgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { laboratory: { select: { code: true, name: true } }, product: { select: { sku: true, name: true } } },
    }),
    prisma.unitLedgerEntry.count({ where }),
  ]);
  return { items, total };
}
