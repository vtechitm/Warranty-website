import Link from "next/link";
import { ListChecks, LayoutTemplate, Pencil, Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listBrands } from "@/server/services/catalog";
import { brandSetup } from "@/server/services/brand-setup";
import { env } from "@/server/env";
import { BRAND_IDENTITY_FIELDS } from "@/server/validation";
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
    { name: "logoUrl", label: "Logo (link https, hoặc để trống và tải logo trong Trang thương hiệu)", defaultValue: b?.logoUrl ?? "", full: true },
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
  const identity = can(actor.role, "brand:identity");
  const setups = new Map(await Promise.all(brands.map(async (b) => [b.id, await brandSetup(actor, b.id)] as const)));
  return (
    <div>
      <PageHeader
        title="Thương hiệu"
        description={manage ? "Mỗi thương hiệu có nhận diện, tên miền, sản phẩm và trang thương hiệu riêng trên cùng một hệ thống." : "Thiết lập thương hiệu của bạn theo các bước trong mục Thiết lập: nhận diện, sản phẩm, trang thương hiệu, tên miền."}
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
              <SetupBar done={setups.get(b.id)!.done} total={setups.get(b.id)!.total} />
              <DomainManager brandId={b.id} domains={JSON.parse(JSON.stringify(b.domains))} manage={can(actor.role, "brand:domains")} serverIp={env().PUBLIC_SERVER_IP ?? null} />
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={`/admin/brands/${b.id}/setup`}><Button variant="outline" size="sm"><ListChecks /> Thiết lập</Button></Link>
                {can(actor.role, "brand:content") && (
                  <Link href={`/admin/brands/${b.id}/landing`}><Button variant="outline" size="sm"><LayoutTemplate /> Trang thương hiệu</Button></Link>
                )}
                {manage ? (
                  <FormDialog trigger={<><Pencil /> Sửa</>} triggerVariant="outline" triggerSize="sm" title={`Sửa ${b.name}`} endpoint={`/brands/${b.id}`} method="PATCH" wide keepNulls fields={brandFields(b)} />
                ) : identity && (
                  <FormDialog trigger={<><Pencil /> Sửa nhận diện</>} triggerVariant="outline" triggerSize="sm" title={`Nhận diện ${b.name}`} endpoint={`/brands/${b.id}`} method="PATCH" wide keepNulls
                    fields={brandFields(b).filter((f) => (BRAND_IDENTITY_FIELDS as readonly string[]).includes(f.name))} />
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SetupBar({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="font-semibold">Thiết lập: {done}/{total} bước</span><span className="text-muted">{pct}%</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-surface"><div className={`h-full rounded-full ${done === total ? "bg-emerald-600" : "bg-navy-900"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
