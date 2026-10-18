import { LookupForm } from "@/components/lookup-form";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tra cứu bảo hành" };

/**
 * Embeddable lookup widget for existing brand websites (integration option B):
 * <iframe src="https://warranty.example.com/embed/lookup?brand=origin" style="width:100%;height:140px;border:0"></iframe>
 */
export default async function EmbedLookup({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand: slug } = await searchParams;
  const brand = slug ? await prisma.brand.findFirst({ where: { slug: slug.slice(0, 40), isActive: true, deletedAt: null } }) : null;
  return (
    <div className="p-3" style={{ background: "transparent" }}>
      <div className="mb-2 text-sm font-semibold" style={{ color: brand?.primaryColor ?? "#0B1F3A" }}>
        Tra cứu bảo hành {brand?.name ?? "răng sứ"} chính hãng
      </div>
      <LookupForm target="_blank" compact accent={brand?.secondaryColor ?? "#C9A96E"} />
    </div>
  );
}
