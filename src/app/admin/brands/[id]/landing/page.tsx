import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getBrandLanding } from "@/server/services/brand-landing";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/misc";
import { LandingEditor } from "./landing-editor";

export const metadata = { title: "Trang thương hiệu" };

export default async function BrandLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const { id } = await params;
  let data;
  try {
    data = await getBrandLanding(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <div>
      <PageHeader
        back={{ href: "/admin/brands", label: "Thương hiệu" }}
        title={`Trang thương hiệu — ${data.brand.name}`}
        description={<>Nội dung trang công khai (tên miền thương hiệu, hoặc <a className="text-navy-700 underline" href={`/b/${data.brand.slug}`} target="_blank">/b/{data.brand.slug}</a>). Phần nào để trống sẽ được ẩn. Nhập theo brief của bộ phận media.</>}
      />
      <LandingEditor brandId={data.brand.id} slug={data.brand.slug} initial={data.content} />
    </div>
  );
}
