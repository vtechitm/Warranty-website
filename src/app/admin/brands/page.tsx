import Link from "next/link";
import { LayoutTemplate, Pencil, Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listBrands } from "@/server/services/catalog";
import { can } from "@/server/auth/permissions";
import { fmtNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormDialog, type FieldSpec } from "@/components/form-dialog";
import { DomainManager } from "./domain-manager";

export const metadata = { title: "Thương hiệu" };

function brandFields(b?: Awaited<ReturnType<typeof listBrands>>[number]): FieldSpec[] {
  return [
    { name: "name", label: "Tên thương hiệu", required: true, defaultValue: b?.name },
    { name: "slug", label: "Slug", required: true, defaultValue: b?.slug, placeholder: "origin" },
    ...(b ? [] : [{ name: "codePrefix", label: "Tiền tố mã (2 chữ cái)", required: true, placeholder: "OR", hint: "Không thể đổi sau khi tạo — in trên mọi mã (VD: OR48291037)" } as FieldSpec]),
    { name: "tagline", label: "Khẩu hiệu", defaultValue: b?.tagline ?? "", full: true },
    { name: "primaryColor", label: "Màu chính", type: "color", defaultValue: b?.primaryColor ?? "#0B1F3A" },
    { name: "secondaryColor", label: "Màu phụ (nhấn)", type: "color", defaultValue: b?.secondaryColor ?? "#C9A96E" },
    { name: "accentColor", label: "Màu nền sáng (trang thương hiệu)", type: "color", defaultValue: b?.accentColor ?? "#F7F2EA" },
    { name: "logoUrl", label: "URL logo", type: "url", defaultValue: b?.logoUrl ?? "", full: true },
    { name: "supportPhone", label: "Hotline", defaultValue: b?.supportPhone ?? "" },
    { name: "supportEmail", label: "Email hỗ trợ", type: "email", defaultValue: b?.supportEmail ?? "" },
    { name: "websiteUrl", label: "Website", type: "url", defaultValue: b?.websiteUrl ?? "" },
    { name: "isActive", label: "Đang hoạt động", type: "checkbox", defaultValue: b?.isActive ?? true },
  ];
}

export default async function BrandsPage() {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const brands = await listBrands(actor);
  const manage = can(actor.role, "brand:manage");
  return (
    <div>
      <PageHeader
        title="Thương hiệu"
        description="Mỗi thương hiệu có nhận diện, tên miền, sản phẩm và trang thương hiệu riêng trên cùng một hệ thống."
        actions={manage && <FormDialog trigger={<><Plus /> Thêm thương hiệu</>} title="Thêm thương hiệu" endpoint="/brands" wide fields={brandFields()} />}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {brands.map((b) => (
          <section key={b.id} className="card overflow-hidden">
            <div className="flex items-center justify-between p-5 text-white" style={{ background: `linear-gradient(135deg, ${b.primaryColor}, #050f1f)` }}>
              <div>
                <div className="text-lg font-bold tracking-wider" style={{ color: b.secondaryColor }}>{b.name.toUpperCase()}</div>
                <div className="text-xs text-white/60">{b.tagline ?? "—"}</div>
              </div>
              <div className="text-right">
                <div className="mono text-sm" style={{ color: b.secondaryColor }}>{b.codePrefix}12345678</div>
                {!b.isActive && <Badge tone="red">Ngừng</Badge>}
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-6 text-sm">
                <div><div className="text-muted">Sản phẩm</div><div className="font-semibold">{b._count.products}</div></div>
                <div><div className="text-muted">Mã đã sinh</div><div className="font-semibold">{fmtNumber(b._count.codes)}</div></div>
                <div><div className="text-muted">Hotline</div><div className="font-semibold">{b.supportPhone ?? "—"}</div></div>
              </div>
              <DomainManager brandId={b.id} domains={JSON.parse(JSON.stringify(b.domains))} manage={manage} />
              <div className="flex flex-wrap justify-end gap-2">
                {can(actor.role, "brand:content") && (
                  <Link href={`/admin/brands/${b.id}/landing`}><Button variant="outline" size="sm"><LayoutTemplate /> Trang thương hiệu</Button></Link>
                )}
                {manage && <FormDialog trigger={<><Pencil /> Sửa</>} triggerVariant="outline" triggerSize="sm" title={`Sửa ${b.name}`} endpoint={`/brands/${b.id}`} method="PATCH" wide keepNulls fields={brandFields(b)} />}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
