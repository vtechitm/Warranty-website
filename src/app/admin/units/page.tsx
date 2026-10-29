import Link from "next/link";
import { z } from "zod";
import { FileUp, Plus, SlidersHorizontal } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listUnitBalances, listUnitLedger } from "@/server/services/units";
import { prisma } from "@/server/db";
import { paginationSchema } from "@/server/validation";
import { parseParams } from "@/lib/params";
import { fmtNumber } from "@/lib/format";
import { PageHeader, Pager, Empty, Kpi, hrefWith } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { FormDialog } from "@/components/form-dialog";
import { UnitLedgerTable } from "@/components/unit-ledger";

export const metadata = { title: "Đơn vị răng" };

const schema = paginationSchema.extend({ laboratoryId: z.string().uuid().optional(), productId: z.string().uuid().optional() });

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["SUPER_ADMIN"]);
  const sp = await searchParams;
  const q = parseParams(schema, sp, { pageSize: 30 });
  const [balances, ledger, labs, products] = await Promise.all([
    listUnitBalances(actor, q),
    listUnitLedger(actor, q),
    prisma.laboratory.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.product.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, sku: true, name: true, brand: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  const totals = balances.reduce((a, b) => ({ allocated: a.allocated + b.allocated, used: a.used + b.used, balance: a.balance + b.balance }), { allocated: 0, used: 0, balance: 0 });
  const labOptions = labs.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }));
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.brand.name} — ${p.name} (${p.sku})` }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đơn vị răng"
        description="Labo mua phôi → Vtech cấp số đơn vị răng theo từng loại phôi. Mỗi lần kích hoạt thẻ trừ đúng số răng của ca; hết đơn vị thì labo không kích hoạt được thẻ của phôi đó. Thu hồi thẻ hoặc sửa giảm số răng sẽ tự hoàn lại."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/units/import"><Button variant="outline"><FileUp /> Nhập từ Excel/CSV</Button></Link>
            <FormDialog
              trigger={<><SlidersHorizontal /> Điều chỉnh</>}
              triggerVariant="outline"
              title="Điều chỉnh đơn vị răng"
              description="Dùng khi cần sửa sai (số âm để giảm). Không làm số dư âm. Mọi điều chỉnh được ghi lịch sử."
              endpoint="/units"
              extraBody={{ kind: "ADJUSTMENT" }}
              submitLabel="Điều chỉnh"
              fields={[
                { name: "laboratoryId", label: "Labo", type: "select", required: true, options: labOptions, defaultValue: q.laboratoryId },
                { name: "productId", label: "Phôi", type: "select", required: true, options: productOptions, defaultValue: q.productId },
                { name: "units", label: "Số đơn vị (+ tăng, − giảm)", type: "number", required: true, min: -1000000, max: 1000000 },
                { name: "note", label: "Lý do", type: "textarea", required: true },
              ]}
            />
            <FormDialog
              trigger={<><Plus /> Cấp đơn vị răng</>}
              title="Cấp đơn vị răng cho labo"
              description="Ghi nhận labo đã mua phôi. Labo chỉ kích hoạt được thẻ của đúng loại phôi này."
              endpoint="/units"
              extraBody={{ kind: "ALLOCATION" }}
              submitLabel="Cấp"
              fields={[
                { name: "laboratoryId", label: "Labo", type: "select", required: true, options: labOptions, defaultValue: q.laboratoryId },
                { name: "productId", label: "Phôi", type: "select", required: true, options: productOptions, defaultValue: q.productId },
                { name: "units", label: "Số đơn vị răng", type: "number", required: true, min: 1, max: 1000000 },
                { name: "reference", label: "Số hoá đơn / chứng từ", placeholder: "VD: HD-2026-0158" },
                { name: "note", label: "Ghi chú", type: "textarea" },
              ]}
            />
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Đã cấp" value={fmtNumber(totals.allocated)} sub={q.laboratoryId || q.productId ? "theo bộ lọc" : "toàn hệ thống"} />
        <Kpi label="Đã dùng (kích hoạt)" value={fmtNumber(totals.used)} />
        <Kpi label="Còn lại" value={fmtNumber(totals.balance)} />
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
        <Select name="laboratoryId" defaultValue={q.laboratoryId ?? ""}>
          <option value="">Mọi labo</option>
          {labs.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
        </Select>
        <Select name="productId" defaultValue={q.productId ?? ""}>
          <option value="">Mọi phôi</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.brand.name} — {p.name}</option>)}
        </Select>
        <Button type="submit">Lọc</Button>
      </form>

      <section className="card overflow-hidden">
        <h2 className="px-5 py-4 font-semibold">Số dư theo labo × phôi</h2>
        {balances.length === 0 ? (
          <Empty>Chưa cấp đơn vị răng cho labo nào.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Labo</th><th>Phôi</th><th className="text-right">Đã cấp</th><th className="text-right">Đã dùng</th><th className="text-right">Còn lại</th></tr></thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={`${b.laboratory.id}-${b.product.id}`}>
                    <td><Link href={hrefWith("/admin/units", {}, { laboratoryId: b.laboratory.id })} className="font-medium text-navy-800 hover:underline">{b.laboratory.code} — {b.laboratory.name}</Link></td>
                    <td>{b.product.name}<div className="text-xs text-muted">{b.product.brand.name} · {b.product.sku}</div></td>
                    <td className="text-right">{fmtNumber(b.allocated)}</td>
                    <td className="text-right">{fmtNumber(b.used)}</td>
                    <td className={`text-right font-bold ${b.balance <= 5 ? "text-red-600" : ""}`}>{fmtNumber(b.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="px-5 py-4 font-semibold">Lịch sử</h2>
        <UnitLedgerTable items={ledger.items} showLab />
        <Pager page={q.page} totalPages={Math.max(1, Math.ceil(ledger.total / q.pageSize))} total={ledger.total} makeHref={(p) => hrefWith("/admin/units", sp, { page: p })} />
      </section>
    </div>
  );
}
