import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { getProduct } from "@/server/services/catalog";
import { can } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { fmtDateTimeVN, fmtDuration, START_RULE_LABEL } from "@/lib/format";
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
        description={`${p.brand.name} · SKU ${p.sku}${p.materialType ? ` · ${p.materialType}` : ""}`}
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
                  { name: "imageUrl", label: "URL hình ảnh", type: "url", defaultValue: p.imageUrl ?? "" },
                  { name: "description", label: "Mô tả", type: "textarea", defaultValue: p.description ?? "" },
                  { name: "isActive", label: "Đang bán", type: "checkbox", defaultValue: p.isActive },
                ]}
              />
              <FormDialog
                trigger={<><Plus /> Phát hành phiên bản chính sách</>}
                title="Phát hành chính sách mới"
                description="Áp dụng cho các lần kích hoạt từ nay. Chứng nhận đã kích hoạt giữ nguyên phiên bản cũ."
                endpoint={`/products/${p.id}/policies`}
                wide
                submitLabel="Phát hành"
                fields={[
                  { name: "durationMonths", label: "Thời hạn (tháng)", type: "number", required: true, defaultValue: current?.durationMonths ?? 60, min: 1, max: 600 },
                  { name: "startRule", label: "Bắt đầu tính", type: "select", required: true, defaultValue: current?.startRule ?? "INSTALLATION_DATE", options: Object.entries(START_RULE_LABEL).map(([value, label]) => ({ value, label })) },
                  { name: "conditions", label: "Điều kiện bảo hành", type: "textarea", defaultValue: current?.conditions ?? "" },
                  { name: "exclusions", label: "Trường hợp không bảo hành", type: "textarea", defaultValue: current?.exclusions ?? "" },
                  { name: "claimInstructions", label: "Thủ tục yêu cầu bảo hành", type: "textarea", defaultValue: current?.claimInstructions ?? "" },
                  { name: "benefits", label: "Quyền lợi (mỗi dòng một ý)", type: "textarea", defaultValue: current?.benefits ?? "" },
                  { name: "careInstructions", label: "Hướng dẫn chăm sóc (mỗi dòng một ý)", type: "textarea", defaultValue: current?.careInstructions ?? "" },
                ]}
              />
            </>
          )
        }
      />
      <section className="card overflow-hidden">
        <h2 className="px-5 py-4 font-semibold">Lịch sử phiên bản chính sách</h2>
        <div className="divide-y divide-line">
          {p.policies.map((pol) => (
            <div key={pol.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[120px_1fr]">
              <div>
                <div className="font-bold">v{pol.version}</div>
                {pol.isCurrent ? <Badge tone="green">Hiện hành</Badge> : <Badge>Lưu trữ</Badge>}
              </div>
              <div className="space-y-1">
                <div><b>{fmtDuration(pol.durationMonths)}</b> · {START_RULE_LABEL[pol.startRule]} · phát hành {fmtDateTimeVN(pol.createdAt)}</div>
                {pol.conditions && <p className="whitespace-pre-line text-muted"><b className="text-ink">Điều kiện:</b> {pol.conditions}</p>}
                {pol.exclusions && <p className="whitespace-pre-line text-muted"><b className="text-ink">Loại trừ:</b> {pol.exclusions}</p>}
              </div>
            </div>
          ))}
          {p.policies.length === 0 && <div className="px-5 py-6 text-sm text-muted">Chưa có chính sách — không thể sinh mã cho sản phẩm này.</div>}
        </div>
      </section>
    </div>
  );
}
