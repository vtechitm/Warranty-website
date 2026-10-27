import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicBrandPage } from "@/server/services/brand-landing";
import { BrandLanding } from "@/components/brand-landing";
import { brandMetadata } from "@/lib/brand-metadata";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await publicBrandPage({ slug: (await params).slug });
  return page ? brandMetadata(page.brand.name, page.content.seo) : {};
}

/** Brand page by slug — preview before a brand domain is connected, or a shareable link (e.g. /b/origin). */
export default async function BrandPage({ params }: Props) {
  const page = await publicBrandPage({ slug: (await params).slug });
  if (!page) notFound();
  return <BrandLanding brand={page.brand} content={page.content} />;
}
