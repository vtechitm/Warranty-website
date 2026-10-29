import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getBatch, searchCodes } from "@/server/services/warranty-codes";
import { AppError } from "@/server/errors";
import { warrantySearchSchema } from "@/server/validation";
import { LABEL_TEMPLATES } from "@/server/pdf/labels";
import { parseParams } from "@/lib/params";
import { fmtDateTimeVN, fmtNumber, fmtPercent } from "@/lib/format";
import { Kpi, PageHeader, Pager, hrefWith } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { WarrantyTable } from "@/components/warranty-table";
import { BatchProgress, ExportPanel } from "./batch-panels";

export const metadata = { title: "Chi tiết lô" };

export default async function BatchDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const { id } = await params;
  const sp = await searchParams;
  let batch;
  try {
    batch = await getBatch(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const q = parseParams(warrantySearchSchema, sp, { pageSize: 50, batchId: id });
  const codes = await searchCodes(actor, { ...q, batchId: id });
  const s = batch.stats;
  const generating = batch.status === "PENDING" || batch.status === "GENERATING";

  return (
    <div>
      <PageHeader
        back={{ href: "/admin/batches", label: "Lô mã" }}
        title={batch.batchNumber}
        description={<>{batch.brand.name} · {batch.product.name} · tạo {fmtDateTimeVN(batch.createdAt)}{batch.createdBy ? ` bởi ${batch.createdBy.name}` : ""} · URL gốc QR: <span className="mono">{batch.qrBaseUrl}</span></>}
        actions={<StatusBadge status={batch.status} label={{ PENDING: "Chờ sinh mã", GENERATING: "Đang sinh mã", COMPLETED: "Hoàn tất", FAILED: "Lỗi" }[batch.status]} />}
      />
      {generating && <BatchProgress batchId={batch.id} initial={batch.generatedCount} quantity={batch.quantity} />}
      {batch.status === "FAILED" && <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">Sinh mã lỗi: {batch.error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Tổng số thẻ" value={fmtNumber(s.total)} />
        <Kpi label="Đã kích hoạt" value={fmtNumber(s.activated)} sub={s.total ? fmtPercent(s.activated / s.total) : undefined} />
        <Kpi label="Chưa dùng" value={fmtNumber(s.unused)} sub="Labo nào được ủy quyền cũng kích hoạt được" />
        <Kpi label="Đã thu hồi" value={fmtNumber(s.revoked)} />
      </div>

      {!generating && (
        <div className="mt-6 max-w-3xl">
          <ExportPanel batchId={batch.id} total={s.total} templates={Object.entries(LABEL_TEMPLATES).map(([value, t]) => ({ value, label: t.name }))} />
        </div>
      )}

      {batch.labs.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <h2 className="px-5 py-4 font-semibold">Kích hoạt theo labo</h2>
          <table className="table-base">
            <thead><tr><th>Labo</th><th className="text-right">Số thẻ</th><th className="text-right">Số răng</th></tr></thead>
            <tbody>
              {batch.labs.map((l) => <tr key={l.laboratory.id}><td>{l.laboratory.code} — {l.laboratory.name}</td><td className="text-right font-semibold">{fmtNumber(l.count)}</td><td className="text-right">{fmtNumber(l.units)}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}

      <section className="card mt-6 overflow-hidden">
        <form className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="font-semibold">Danh sách mã</h2>
          <div className="flex gap-2">
            <input name="q" defaultValue={sp.q} placeholder="Tìm mã…" className="field h-9 w-56 py-1 text-sm" />
            <select name="status" defaultValue={sp.status ?? ""} className="field h-9 w-40 py-1 text-sm">
              <option value="">Tất cả</option>
              <option value="CREATED">Chưa dùng</option>
              <option value="ACTIVATED">Đã kích hoạt</option>
              <option value="REVOKED">Thu hồi</option>
            </select>
            <button className="rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">Lọc</button>
          </div>
        </form>
        <WarrantyTable rows={codes.items} hrefBase="/admin/warranties" showLab />
        <Pager page={q.page} totalPages={Math.max(1, Math.ceil(codes.total / q.pageSize))} total={codes.total} makeHref={(p) => hrefWith(`/admin/batches/${id}`, sp, { page: p })} />
      </section>
    </div>
  );
}
