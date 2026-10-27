import Link from "next/link";
import { z } from "zod";
import { FileUp, Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listBatches } from "@/server/services/warranty-codes";
import { listBrands, listProducts } from "@/server/services/catalog";
import { paginationSchema } from "@/server/validation";
import { can } from "@/server/auth/permissions";
import { parseParams } from "@/lib/params";
import { fmtDateTimeVN, fmtNumber } from "@/lib/format";
import { PageHeader, Pager, Empty, hrefWith } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { FormDialog } from "@/components/form-dialog";

export const metadata = { title: "Lô mã QR" };

const schema = paginationSchema.extend({
  brandId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  q: z.string().max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export default async function BatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const sp = await searchParams;
  const q = parseParams(schema, sp, { pageSize: 20 });
  const [{ items, total }, brands, products] = await Promise.all([listBatches(actor, q), listBrands(actor), listProducts(actor)]);
  const activeProducts = products.filter((p) => p.isActive && p.policies.length > 0);

  return (
    <div>
      <PageHeader
        title="Lô mã bảo hành"
        description="Sinh mã & QR trước khi có thông tin bệnh nhân. Mã và URL QR cố định vĩnh viễn."
        actions={
          can(actor.role, "batch:generate") && (
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/batches/import"><Button variant="outline"><FileUp /> Nhập cấp mã (Excel/CSV)</Button></Link>
              <FormDialog
                trigger={<><Plus /> Sinh lô mã mới</>}
                title="Sinh lô mã bảo hành"
                description="Lô lớn (> 2.000 mã) được xử lý nền — trang chi tiết sẽ hiển thị tiến độ."
                endpoint="/batches"
                submitLabel="Sinh mã"
                fields={[
                  { name: "productId", label: "Sản phẩm", type: "select", required: true, options: activeProducts.map((p) => ({ value: p.id, label: `${p.brand.name} — ${p.name}` })), hint: "Chỉ hiển thị sản phẩm đã có thông tin phôi" },
                  { name: "quantity", label: "Số lượng mã", type: "number", required: true, defaultValue: 1000, min: 1, max: 50000 },
                  { name: "notes", label: "Ghi chú", type: "textarea", placeholder: "VD: In thẻ đợt tháng 10" },
                ]}
                redirectTemplate="/admin/batches/{id}"
              />
            </div>
          )
        }
      />

      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_200px_240px_auto]">
        <input name="q" defaultValue={sp.q} placeholder="Tìm số lô, VD: BATCH-2026-001" className="field" />
        <Select name="brandId" defaultValue={sp.brandId ?? ""}>
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select name="productId" defaultValue={sp.productId ?? ""}>
          <option value="">Tất cả sản phẩm</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.brand.name} — {p.name}</option>)}
        </Select>
        <Button type="submit">Lọc</Button>
      </form>

      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <Empty>Chưa có lô mã nào.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Số lô</th><th>Sản phẩm</th><th className="text-right">Tổng</th><th className="text-right">Đã cấp</th><th className="text-right">Đã kích hoạt</th><th className="text-right">Chưa cấp</th><th>Tiến độ</th><th>Trạng thái</th><th>Ngày tạo</th></tr>
              </thead>
              <tbody>
                {items.map((b) => {
                  const rate = b.stats.total ? b.stats.activated / b.stats.total : 0;
                  return (
                    <tr key={b.id}>
                      <td><Link href={`/admin/batches/${b.id}`} className="font-semibold text-navy-800 hover:underline">{b.batchNumber}</Link></td>
                      <td><div>{b.product.name}</div><div className="text-xs text-muted">{b.brand.name}</div></td>
                      <td className="text-right font-semibold">{fmtNumber(b.quantity)}</td>
                      <td className="text-right">{fmtNumber(b.stats.assigned)}</td>
                      <td className="text-right">{fmtNumber(b.stats.activated)}</td>
                      <td className="text-right">{fmtNumber(b.stats.unassigned)}</td>
                      <td className="min-w-28"><div className="h-2 rounded-full bg-surface"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate * 100}%` }} /></div></td>
                      <td><StatusBadge status={b.status} label={{ PENDING: "Chờ", GENERATING: `Đang sinh ${b.generatedCount}/${b.quantity}`, COMPLETED: "Hoàn tất", FAILED: "Lỗi" }[b.status]} /></td>
                      <td className="whitespace-nowrap text-sm text-muted">{fmtDateTimeVN(b.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={q.page} totalPages={Math.max(1, Math.ceil(total / q.pageSize))} total={total} makeHref={(p) => hrefWith("/admin/batches", sp, { page: p })} />
      </div>
    </div>
  );
}
