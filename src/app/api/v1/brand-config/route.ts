import { api } from "@/server/http/handler";
import { resolveBrandByHost } from "@/server/services/catalog";

/** Public: brand theme for the requesting (verified) hostname. Used by brand sites & widgets. */
export const GET = api({ auth: "none" }, async ({ req }) => {
  const host = req.nextUrl.searchParams.get("host") ?? req.headers.get("host");
  const r = await resolveBrandByHost(host);
  if (!r) return null;
  const b = r.brand;
  return { slug: b.slug, name: b.name, tagline: b.tagline, logoUrl: b.logoUrl, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, accentColor: b.accentColor, supportPhone: b.supportPhone, supportEmail: b.supportEmail, websiteUrl: b.websiteUrl };
});
