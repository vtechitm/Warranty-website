import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import type { Actor } from "@/server/auth/permissions";
import { addBrandDomain, removeBrandDomain, updateBrand, updateBrandDomain, verifyBrandDomain } from "@/server/services/catalog";
import { brandSetup } from "@/server/services/brand-setup";
import { updateBrandLanding } from "@/server/services/brand-landing";
import { createAndGenerateBatch } from "@/server/services/warranty-codes";
import { landingSchema } from "@/server/landing-schema";
import { DEMO_LANDING } from "../prisma/demo-landing";
import { makeUser, resetDb, seedBasics } from "./helpers";

type Ctx = Awaited<ReturnType<typeof seedBasics>>;
let ctx: Ctx;
let media: Actor;

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
}

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  media = { ...(await makeUser("BRAND_ADMIN")), brandIds: [ctx.brand.id] };
});

describe("brand admin self-service", () => {
  it("edits identity of own brand only; name, slug and status stay with Vtech", async () => {
    await updateBrand(media, ctx.brand.id, { primaryColor: "#123456", supportPhone: "1900 1234", logoUrl: "https://cdn.example.com/logo.png" });
    const b = await prisma.brand.findUniqueOrThrow({ where: { id: ctx.brand.id } });
    expect(b).toMatchObject({ primaryColor: "#123456", supportPhone: "1900 1234", logoUrl: "https://cdn.example.com/logo.png" });
    await expectAppError(updateBrand(media, ctx.brand.id, { name: "Đổi tên" }), "FORBIDDEN");
    await expectAppError(updateBrand(media, ctx.brand.id, { isActive: false }), "FORBIDDEN");
    const other = await prisma.brand.create({ data: { name: "Other", slug: "other", codePrefix: "OT" } });
    await expectAppError(updateBrand(media, other.id, { tagline: "x" }), "FORBIDDEN");
    await expectAppError(updateBrand(ctx.labAUser, ctx.brand.id, { tagline: "x" }), "FORBIDDEN");
  });

  it("adds, verifies and makes primary its own domains; cannot touch other brands' domains", async () => {
    const d = await addBrandDomain(media, ctx.brand.id, { hostname: "baohanh.origin.test", isPrimary: false, redirectToPrimary: false });
    await expectAppError(updateBrandDomain(media, d.id, { isPrimary: true }), "CONFLICT"); // must verify first
    await verifyBrandDomain(media, d.id); // manual verification is allowed outside production
    await updateBrandDomain(media, d.id, { isPrimary: true });
    expect((await prisma.brandDomain.findUniqueOrThrow({ where: { id: d.id } })).isPrimary).toBe(true);

    const other = await prisma.brand.create({ data: { name: "Other", slug: "other", codePrefix: "OT" } });
    await expectAppError(addBrandDomain(media, other.id, { hostname: "x.other.test", isPrimary: false, redirectToPrimary: false }), "FORBIDDEN");
    const foreign = await addBrandDomain(ctx.admin, other.id, { hostname: "y.other.test", isPrimary: false, redirectToPrimary: false });
    await expectAppError(verifyBrandDomain(media, foreign.id), "FORBIDDEN");
    await expectAppError(removeBrandDomain(media, foreign.id), "FORBIDDEN");
    await expectAppError(addBrandDomain(ctx.labAUser, ctx.brand.id, { hostname: "z.origin.test", isPrimary: false, redirectToPrimary: false }), "FORBIDDEN");
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "brand.domain_" } } })).toBeGreaterThanOrEqual(4);
  });
});

describe("setup checklist", () => {
  it("tracks every onboarding step from real data", async () => {
    const step = async (k: string) => (await brandSetup(media, ctx.brand.id)).steps.find((s) => s.key === k)!;
    const start = await brandSetup(media, ctx.brand.id);
    expect(start.total).toBe(7);
    expect(start.steps.filter((s) => s.done).map((s) => s.key)).toEqual(["labs"]); // seed authorizes two labs

    expect((await step("identity")).done).toBe(false);
    await updateBrand(media, ctx.brand.id, { logoUrl: "https://cdn.example.com/logo.png", supportPhone: "1900 1234" });
    expect((await step("identity")).done).toBe(true);

    expect((await step("products")).done).toBe(false); // product has policy but no origin
    await prisma.product.update({ where: { id: ctx.product.id }, data: { origin: "Sản xuất tại Hoa Kỳ" } });
    expect((await step("products")).done).toBe(true);

    expect((await step("landing")).done).toBe(false);
    const content = landingSchema.parse(DEMO_LANDING);
    await updateBrandLanding(media, ctx.brand.id, { ...content, hero: { ...content.hero, imageUrl: "https://cdn.example.com/banner.jpg" } });
    expect((await step("landing")).done).toBe(true);

    const d = await addBrandDomain(media, ctx.brand.id, { hostname: "baohanh.origin.test", isPrimary: false, redirectToPrimary: false });
    expect((await step("domain")).detail).toContain("chờ xác minh");
    await verifyBrandDomain(media, d.id);
    await updateBrandDomain(media, d.id, { isPrimary: true });
    expect((await step("domain")).done).toBe(true);

    expect((await step("batch")).done).toBe(false);
    await createAndGenerateBatch(ctx.admin, { productId: ctx.product.id, quantity: 2, notes: null });
    expect((await step("batch")).done).toBe(true); // batch QR now uses https://baohanh.origin.test

    const other = { ...(await makeUser("BRAND_ADMIN")), brandIds: [] as string[] };
    await expectAppError(brandSetup(other, ctx.brand.id), "FORBIDDEN");
  });
});
