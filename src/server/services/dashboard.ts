import { listUnitBalances } from "./units";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, brandScope, requireLab, type Actor } from "../auth/permissions";
import { todayVN } from "./validity";

type Roll = { total: number; activated: number };

function rollup(rows: { key: string; activationStatus: string; count: number }[]) {
  const m = new Map<string, Roll>();
  for (const r of rows) {
    const v = m.get(r.key) ?? { total: 0, activated: 0 };
    v.total += r.count;
    if (r.activationStatus === "ACTIVATED") v.activated += r.count;
    m.set(r.key, v);
  }
  return m;
}

export async function adminDashboard(actor: Actor, range: { from?: Date; to?: Date } = {}) {
  assertCan(actor, "batch:read");
  const scope = brandScope(actor);
  const brandWhere = scope ? { brandId: { in: scope } } : {};
  const dateFilter = range.from || range.to ? { gte: range.from, lte: range.to } : undefined;
  const today = todayVN();
  const claimScope = scope ? { warrantyCode: { brandId: { in: scope } } } : {};

  const unitScope = scope ? { product: { brandId: { in: scope } } } : {};
  const [generated, units, activated, activatedInRange, revoked, active, expired, pending, claims, openClaims] = await Promise.all([
    prisma.warrantyCode.count({ where: brandWhere }),
    prisma.unitLedgerEntry.groupBy({ by: ["kind"], where: unitScope, _sum: { delta: true } }),
    prisma.warrantyCode.count({ where: { ...brandWhere, activationStatus: "ACTIVATED" } }),
    prisma.warrantyCode.count({ where: { ...brandWhere, activationStatus: "ACTIVATED", activatedAt: dateFilter } }),
    prisma.warrantyCode.count({ where: { ...brandWhere, revokedAt: { not: null } } }),
    prisma.restorationCase.count({
      where: { ...brandWhere, suspendedAt: null, warrantyStartDate: { lte: today }, warrantyEndDate: { gt: today }, warrantyCode: { revokedAt: null } },
    }),
    prisma.restorationCase.count({ where: { ...brandWhere, warrantyEndDate: { lte: today }, warrantyCode: { revokedAt: null } } }),
    prisma.restorationCase.count({ where: { ...brandWhere, installationStatus: "PENDING_CONFIRMATION", warrantyCode: { revokedAt: null } } }),
    prisma.warrantyClaim.count({ where: claimScope }),
    prisma.warrantyClaim.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED"] }, ...claimScope } }),
  ]);

  const brandFilter = scope ? Prisma.sql`AND "brandId" = ANY(${scope}::uuid[])` : Prisma.empty;
  const monthly = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
    SELECT to_char(date_trunc('month', "activatedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
    FROM "WarrantyCode"
    WHERE "activationStatus" = 'ACTIVATED' AND "activatedAt" >= now() - interval '12 months' ${brandFilter}
    GROUP BY 1 ORDER BY 1`;

  const [byBrand, byProduct, byLab] = await Promise.all([
    prisma.warrantyCode.groupBy({ by: ["brandId", "activationStatus"], where: brandWhere, _count: { _all: true } }),
    prisma.warrantyCode.groupBy({ by: ["productId", "activationStatus"], where: brandWhere, _count: { _all: true } }),
    prisma.warrantyActivation.groupBy({
      by: ["laboratoryId"],
      _count: { _all: true },
      orderBy: { _count: { laboratoryId: "desc" } },
      take: 10,
      where: { activatedAt: dateFilter, ...claimScope },
    }),
  ]);
  const [brands, products, labs] = await Promise.all([
    prisma.brand.findMany({ where: { id: { in: [...new Set(byBrand.map((b) => b.brandId))] } }, select: { id: true, name: true, primaryColor: true } }),
    prisma.product.findMany({ where: { id: { in: [...new Set(byProduct.map((p) => p.productId))] } }, select: { id: true, name: true } }),
    prisma.laboratory.findMany({ where: { id: { in: byLab.map((l) => l.laboratoryId) } }, select: { id: true, name: true, code: true } }),
  ]);
  const brandRoll = rollup(byBrand.map((r) => ({ key: r.brandId, activationStatus: r.activationStatus, count: r._count._all })));
  const productRoll = rollup(byProduct.map((r) => ({ key: r.productId, activationStatus: r.activationStatus, count: r._count._all })));

  return {
    kpis: {
      generated, activated, activatedInRange, revoked, active, expired, pendingInstallation: pending, claims, openClaims,
      activationRate: generated ? activated / generated : 0,
      units: {
        sold: units.filter((u) => u.kind === "ALLOCATION" || u.kind === "ADJUSTMENT").reduce((a, u) => a + (u._sum.delta ?? 0), 0),
        used: -units.filter((u) => u.kind === "ACTIVATION" || u.kind === "REFUND").reduce((a, u) => a + (u._sum.delta ?? 0), 0),
      },
    },
    monthly: fillMonths(monthly.map((m) => ({ month: m.month, count: Number(m.count) }))),
    byBrand: brands.map((b) => ({ ...b, ...brandRoll.get(b.id)! })).sort((a, b) => b.activated - a.activated),
    byProduct: products
      .map((p) => {
        const r = productRoll.get(p.id)!;
        return { ...p, ...r, rate: r.total ? r.activated / r.total : 0 };
      })
      .sort((a, b) => b.activated - a.activated),
    topLabs: byLab.map((l) => ({ laboratory: labs.find((x) => x.id === l.laboratoryId)!, count: l._count._all })),
    statusDistribution: {
      unused: Math.max(generated - activated - revoked, 0),
      activated,
      revoked,
    },
  };
}

function fillMonths(rows: { month: string; count: number }[]) {
  const out: { month: string; count: number }[] = [];
  const now = todayVN();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, count: rows.find((r) => r.month === key)?.count ?? 0 });
  }
  return out;
}

export async function labDashboard(actor: Actor) {
  const labId = requireLab(actor);
  const [balances, activated, pending, recent] = await Promise.all([
    listUnitBalances(actor),
    prisma.restorationCase.count({ where: { laboratoryId: labId, warrantyCode: { revokedAt: null } } }),
    prisma.restorationCase.count({ where: { laboratoryId: labId, installationStatus: "PENDING_CONFIRMATION" } }),
    prisma.warrantyActivation.findMany({
      where: { laboratoryId: labId },
      orderBy: { activatedAt: "desc" },
      take: 8,
      include: {
        warrantyCode: { select: { code: true, revokedAt: true, product: { select: { name: true } } } },
        activatedBy: { select: { name: true } },
      },
    }),
  ]);
  const cases = await prisma.restorationCase.findMany({
    where: { warrantyCodeId: { in: recent.map((r) => r.warrantyCodeId) } },
    select: { warrantyCodeId: true, clinicName: true, unitCount: true, warrantyEndDate: true, installationStatus: true },
  });
  return {
    balances,
    unitsLeft: balances.reduce((a, b) => a + b.balance, 0),
    activated,
    pendingInstallation: pending,
    recent: recent.map((r) => ({ ...r, case: cases.find((c) => c.warrantyCodeId === r.warrantyCodeId) ?? null })),
  };
}
