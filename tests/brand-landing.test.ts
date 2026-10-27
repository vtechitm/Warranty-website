import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { LocalStorage, setStorage } from "@/server/storage";
import { landingSchema, parseLanding } from "@/server/landing-schema";
import { getBrandAsset, getBrandLanding, publicBrandPage, updateBrandLanding, uploadBrandAsset } from "@/server/services/brand-landing";
import { GET as assetRoute } from "@/app/api/v1/brand-assets/[brandId]/[name]/route";
import { DEMO_LANDING } from "../prisma/demo-landing";
import { makeUser, resetDb, seedBasics } from "./helpers";

type Ctx = Awaited<ReturnType<typeof seedBasics>>;
let ctx: Ctx;
const storageDir = mkdtempSync(path.join(tmpdir(), "vtech-brand-"));
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d00000000049454e44ae426082", "hex");
const file = (name: string, body: Buffer, type: string) => new File([new Uint8Array(body)], name, { type });

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
}

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  setStorage(new LocalStorage(storageDir));
});
afterAll(() => {
  setStorage(null);
  rmSync(storageDir, { recursive: true, force: true });
});

describe("brand page content", () => {
  it("validates limits and image sources; empty content is valid and hides sections", () => {
    expect(landingSchema.parse({}).products).toEqual([]);
    expect(landingSchema.parse(DEMO_LANDING).products).toHaveLength(3);
    expect(landingSchema.safeParse({ hero: { title: "x".repeat(91) } }).success).toBe(false);
    expect(landingSchema.safeParse({ products: Array.from({ length: 7 }, (_, i) => ({ name: `P${i}` })) }).success).toBe(false);
    expect(landingSchema.safeParse({ hero: { imageUrl: "javascript:alert(1)" } }).success).toBe(false);
    expect(landingSchema.safeParse({ hero: { imageUrl: "http://insecure.example/a.jpg" } }).success).toBe(false);
    expect(landingSchema.safeParse({ partners: [{ name: "A", url: "javascript:alert(1)" }] }).success).toBe(false);
    const ok = landingSchema.parse({ hero: { imageUrl: `/api/v1/brand-assets/${ctx.brand.id}/0b8a2f62-3c1f-4c3e-9f55-6a1d2e3f4a5b.webp` } });
    expect(ok.hero.imageUrl).toMatch(/\.webp$/);
    // Corrupt stored JSON never breaks the public page.
    expect(parseLanding({ hero: { title: 42 } }).hero.title).toBeNull();
  });

  it("super admin and the brand's own admin can edit; other brand admins and labs cannot", async () => {
    const content = landingSchema.parse(DEMO_LANDING);
    await updateBrandLanding(ctx.admin, ctx.brand.id, content);
    expect((await getBrandLanding(ctx.admin, ctx.brand.id)).content.hero.title).toBe(content.hero.title);

    const own = { ...(await makeUser("BRAND_ADMIN")), brandIds: [ctx.brand.id] };
    await updateBrandLanding(own, ctx.brand.id, { ...content, faq: [] });
    expect((await publicBrandPage({ slug: "origin" }))!.content.faq).toEqual([]);

    const other = await prisma.brand.create({ data: { name: "Other", slug: "other", codePrefix: "OT" } });
    const otherAdmin = { ...(await makeUser("BRAND_ADMIN")), brandIds: [other.id] };
    await expectAppError(updateBrandLanding(otherAdmin, ctx.brand.id, content), "FORBIDDEN");
    await expectAppError(updateBrandLanding(ctx.labAUser, ctx.brand.id, content), "FORBIDDEN");
    expect(await prisma.auditLog.count({ where: { action: "brand.landing_update" } })).toBe(2);

    await prisma.brand.update({ where: { id: ctx.brand.id }, data: { isActive: false } });
    expect(await publicBrandPage({ slug: "origin" })).toBeNull();
  });

  it("uploads images (validated by content) and serves them publicly with immutable caching", async () => {
    const { url } = await uploadBrandAsset(ctx.admin, ctx.brand.id, file("banner.png", PNG, "image/png"));
    expect(url).toMatch(new RegExp(`^/api/v1/brand-assets/${ctx.brand.id}/[0-9a-f-]{36}\\.png$`));
    expect(landingSchema.parse({ hero: { imageUrl: url } }).hero.imageUrl).toBe(url);
    const name = url.split("/").pop()!;
    expect((await getBrandAsset(ctx.brand.id, name)).body.equals(PNG)).toBe(true);

    const res = await assetRoute(new NextRequest(`http://localhost:3000${url}`), { params: Promise.resolve({ brandId: ctx.brand.id, name }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-type")).toBe("image/png");

    await expectAppError(uploadBrandAsset(ctx.admin, ctx.brand.id, file("x.svg", Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")), "BAD_REQUEST");
    await expectAppError(uploadBrandAsset(ctx.labAUser, ctx.brand.id, file("a.png", PNG, "image/png")), "FORBIDDEN");
    await expectAppError(getBrandAsset(ctx.brand.id, "../secret.png"), "NOT_FOUND");
    await expectAppError(getBrandAsset(ctx.brand.id, "0b8a2f62-3c1f-4c3e-9f55-6a1d2e3f4a5b.png"), "NOT_FOUND");
  });
});
