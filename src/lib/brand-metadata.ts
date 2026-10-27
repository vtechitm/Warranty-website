import type { Metadata } from "next";
import type { LandingContent } from "@/server/landing-schema";

/** Page metadata for a brand page. Brand pages are public marketing pages, so they may be indexed. */
export function brandMetadata(brandName: string, seo: LandingContent["seo"]): Metadata {
  const title = seo.title ?? `${brandName} — Truy xuất nguồn gốc chính hãng`;
  return {
    title: { absolute: title },
    description: seo.description ?? `Tra cứu nguồn gốc xuất xứ và bảo hành răng sứ ${brandName} chính hãng.`,
    robots: { index: true, follow: true },
    openGraph: { title, description: seo.description ?? undefined, images: seo.ogImageUrl ? [seo.ogImageUrl] : undefined },
  };
}
