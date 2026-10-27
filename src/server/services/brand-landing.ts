import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { notFound } from "../errors";
import { storage } from "../storage";
import { validateImageFile, type UploadedFile } from "../images";
import { assertBrandAccess, assertCan, type Actor } from "../auth/permissions";
import { parseLanding, type LandingContent } from "../landing-schema";
import { audit } from "./audit";

/** Brand page images: banners up to 5 MB (media should export ~300–600 KB WebP/JPEG). */
export const BRAND_ASSET_MAX_BYTES = 5 * 1024 * 1024;

const ASSET_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const brandAssetUrl = (brandId: string, name: string) => `/api/v1/brand-assets/${brandId}/${name}`;

async function brandFor(actor: Actor, brandId: string) {
  assertCan(actor, "brand:content");
  assertBrandAccess(actor, brandId);
  const brand = await prisma.brand.findFirst({ where: { id: brandId, deletedAt: null } });
  if (!brand) throw notFound("Thương hiệu không tồn tại");
  return brand;
}

export async function getBrandLanding(actor: Actor, brandId: string) {
  const brand = await brandFor(actor, brandId);
  return { brand: { id: brand.id, name: brand.name, slug: brand.slug }, content: parseLanding(brand.landingConfig) };
}

/** Replaces the brand page content (already validated with `landingSchema`). */
export async function updateBrandLanding(actor: Actor, brandId: string, content: LandingContent) {
  await brandFor(actor, brandId);
  await prisma.brand.update({ where: { id: brandId }, data: { landingConfig: content as unknown as Prisma.InputJsonValue } });
  await audit(actor, {
    action: "brand.landing_update", entityType: "Brand", entityId: brandId,
    metadata: { products: content.products.length, faq: content.faq.length, testimonials: content.testimonials.length, partners: content.partners.length },
  });
  return content;
}

/** Stores a brand page image (public once referenced by the page). Returns its URL for the content form. */
export async function uploadBrandAsset(actor: Actor, brandId: string, file: UploadedFile) {
  await brandFor(actor, brandId);
  const img = await validateImageFile(file, BRAND_ASSET_MAX_BYTES);
  const name = `${randomUUID()}.${img.ext}`;
  await storage().put(`brands/${brandId}/${name}`, img.body, img.contentType);
  await audit(actor, { action: "brand.asset_upload", entityType: "Brand", entityId: brandId, metadata: { name, bytes: img.body.length, type: img.contentType } });
  return { url: brandAssetUrl(brandId, name), contentType: img.contentType, bytes: img.body.length };
}

/** Public read of a brand page image. Names are random UUIDs, so the response can be cached forever. */
export async function getBrandAsset(brandId: string, name: string) {
  if (!/^[0-9a-f-]{36}$/.test(brandId) || !ASSET_NAME.test(name)) throw notFound();
  const obj = await storage().get(`brands/${brandId}/${name}`);
  if (!obj) throw notFound();
  return obj;
}

/** Public data for rendering a brand page (by verified host or by slug). */
export async function publicBrandPage(where: { slug: string } | { id: string }) {
  const brand = await prisma.brand.findFirst({ where: { ...where, isActive: true, deletedAt: null } });
  if (!brand) return null;
  return { brand, content: parseLanding(brand.landingConfig) };
}
