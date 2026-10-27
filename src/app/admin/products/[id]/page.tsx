import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { getProduct } from "@/server/services/catalog";
import { can } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { fmtDateTimeVN, fmtDuration } from "@/lib/format";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@/components/form-dialog";

export const metadata = { title: "Chi tiết sản phẩm" };

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const { id } = await params;
  let p;
  try {
    p = await getProduct(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const current = p.policies.find((x) => x.isCurrent);
  const manage = can(actor.role, "policy:manage");
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/products", label: "Sản phẩm" }}
        title={p.name}
        description={`${p.brand.name} · SKU ${p.sku}${p.materialType ? ` · ${p.materialType}` : ""}${p.origin ? ` · Xuất xứ: ${p.origin}` : ""}`}
        actions={
          manage && (
            <>
              <FormDialog
                trigger={<><Pencil /> Sửa sản phẩm</>}
                triggerVariant="outline"
                title="Sửa sản phẩm"
                endpoint={`/products/${p.id}`}
                method="PATCH"
                keepNulls
                fields={[
                  { name: "name", label: "Tên", required: true, defaultValue: p.name },
                  { name: "materialType", label: "Loại vật liệu", defaultValue: p.materialType ?? "" },
                  { name: "origin", label: "Xuất xứ / nhà sản xuất", defaultValue: p.origin ?? "", placeholder: "VD: Sản xuất tại Đức — nhập khẩu bởi Vtech" },
                  { name: "imageUrl", label: "URL hình ảnh", type: "url", defaultValue: p.imageUrl ?? "" },
                  { name: "description", label: "Mô tả", type: "textarea", defaultValue: p.description ?? "" },
                  { name: "isActive", label: "Đang bán", type: "checkbox", defaultValue: p.isActive },
                ]}
              />
              <FormDialog
                trigger={<><Plus /> Cập nhật thông tin phôi</>}
                title="Cập nhật thông tin phôi"
                description="Thời hạn bảo hành chỉ là gợi ý — labo tự chọn thời hạn khi kích hoạt. Hồ sơ đã kích hoạt không bị ảnh hưởng."
                endpoint={`/products/${p.id}/policies`}
                wide
                submitLabel="Lưu phiên bản mới"
                fields={[
                  { name: "durationMonths", label: "Thời hạn bảo hành gợi ý cho labo (tháng)", type: "number", required: true, defaultValue: current?.durationMonths ?? 60, min: 1, max: 600, hint: "Điền sẵn trong form kích hoạt, labo có thể sửa" },
                  { name: "careInstructions", label: "Hướng dẫn chăm sóc (mỗi dòng một ý)", type: "textarea", defaultValue: current?.careInstructions ?? "", full: true },
                ]}
              />
            </>
          )
        }
      />
      <section className="card overflow-hidden">
        <h2 className="px-5 py-4 font-semibold">Lịch sử thông tin phôi</h2>
        <div className="divide-y divide-line">
          {p.policies.map((pol) => (
            <div key={pol.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[120px_1fr]">
              <div>
                <div className="font-bold">v{pol.version}</div>
                {pol.isCurrent ? <Badge tone="green">Hiện hành</Badge> : <Badge>Lưu trữ</Badge>}
              </div>
              <div className="space-y-1">
                <div>Bảo hành gợi ý: <b>{fmtDuration(pol.durationMonths)}</b> · cập nhật {fmtDateTimeVN(pol.createdAt)}</div>
                {pol.careInstructions && <p className="whitespace-pre-line text-muted"><b className="text-ink">Hướng dẫn chăm sóc:</b> {pol.careInstructions}</p>}
              </div>
            </div>
          ))}
          {p.policies.length === 0 && <div className="px-5 py-6 text-sm text-muted">Chưa có thông tin phôi — không thể sinh mã cho sản phẩm này.</div>}
        </div>
      </section>
    </div>
  );
}
