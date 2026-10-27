import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listBrands, listProducts } from "@/server/services/catalog";
import { can } from "@/server/auth/permissions";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@/components/form-dialog";

export const metadata = { title: "Sản phẩm" };

export default async function ProductsPage() {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const [products, brands] = await Promise.all([listProducts(actor), listBrands(actor)]);
  return (
    <div>
      <PageHeader
        title="Sản phẩm (phôi)"
        description="Thông tin phôi hiển thị trên trang truy xuất nguồn gốc. Thời hạn bảo hành chỉ là gợi ý — labo tự chọn khi kích hoạt."
        actions={
          can(actor.role, "product:manage") && (
            <FormDialog
              trigger={<><Plus /> Thêm sản phẩm</>}
              title="Thêm sản phẩm"
              description="Thông tin phôi và thời hạn bảo hành gợi ý cho labo."
              endpoint="/products"
              wide
              fields={[
                { name: "brandId", label: "Thương hiệu", type: "select", required: true, options: brands.map((b) => ({ value: b.id, label: b.name })) },
                { name: "sku", label: "Mã SKU", required: true, placeholder: "OBP" },
                { name: "name", label: "Tên sản phẩm", required: true, full: true, placeholder: "Origin Beyond Plus" },
                { name: "materialType", label: "Loại vật liệu", placeholder: "Zirconia đa lớp" },
                { name: "origin", label: "Xuất xứ / nhà sản xuất", placeholder: "Sản xuất tại Đức — nhập khẩu bởi Vtech" },
                { name: "imageUrl", label: "URL hình ảnh", type: "url" },
                { name: "description", label: "Mô tả", type: "textarea" },
                { name: "policy.durationMonths", label: "Bảo hành gợi ý cho labo (tháng)", type: "number", required: true, defaultValue: 120, min: 1, max: 600, hint: "Labo có thể sửa khi kích hoạt" },
                { name: "policy.careInstructions", label: "Hướng dẫn chăm sóc (mỗi dòng một ý)", type: "textarea" },
              ]}
            />
          )
        }
      />
      <div className="card overflow-hidden">
        {products.length === 0 ? (
          <Empty>Chưa có sản phẩm.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Sản phẩm</th><th>Thương hiệu</th><th>Bảo hành gợi ý</th><th className="text-right">Mã đã sinh</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {products.map((p) => {
                  const pol = p.policies[0];
                  return (
                    <tr key={p.id}>
                      <td><Link href={`/admin/products/${p.id}`} className="font-semibold text-navy-800 hover:underline">{p.name}</Link><div className="text-xs text-muted">{p.sku} · {p.materialType ?? "—"}</div></td>
                      <td>{p.brand.name}</td>
                      <td className="text-sm">{pol ? <>{fmtDuration(pol.durationMonths)}<div className="text-xs text-muted">Labo có thể chọn khác</div></> : <Badge tone="amber">Chưa có thông tin phôi</Badge>}</td>
                      <td className="text-right">{fmtNumber(p._count.codes)}</td>
                      <td>{p.isActive ? <Badge tone="green">Đang bán</Badge> : <Badge>Ngừng</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
