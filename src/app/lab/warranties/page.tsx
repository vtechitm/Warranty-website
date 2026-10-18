import { Download, Search } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { searchCodes } from "@/server/services/warranty-codes";
import { warrantySearchSchema } from "@/server/validation";
import { parseParams } from "@/lib/params";
import { WarrantyTable } from "@/components/warranty-table";
import { PageHeader, Pager, hrefWith } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

export const metadata = { title: "Lịch sử bảo hành" };

export default async function LabWarranties({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["LAB_ADMIN", "LAB_STAFF"]);
  const sp = await searchParams;
  const q = parseParams(warrantySearchSchema, sp, { pageSize: 25 });
  const result = await searchCodes(actor, q);
  const totalPages = Math.max(1, Math.ceil(result.total / q.pageSize));
  const exportHref = hrefWith("/api/v1/warranties/export", sp, { page: undefined });

  return (
    <div>
      <PageHeader
        title="Mã bảo hành của labo"
        description={sp.pending ? "Các ca đã kích hoạt đang chờ xác nhận ngày lắp." : "Tất cả mã được Vtech cấp cho labo và các ca đã kích hoạt."}
        actions={actor.role === "LAB_ADMIN" ? <a href={exportHref}><Button variant="outline"><Download /> Xuất Excel</Button></a> : undefined}
      />
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder={actor.role === "LAB_ADMIN" ? "Mã, phòng khám, tên / SĐT bệnh nhân…" : "Mã bảo hành, phòng khám…"} className="field pl-10" />
        </div>
        {sp.pending && <input type="hidden" name="pending" value="1" />}
        <Select name="status" defaultValue={sp.status ?? ""}>
          <option value="">Tất cả trạng thái</option>
          <option value="ASSIGNED">Chưa kích hoạt</option>
          <option value="ACTIVATED">Đã kích hoạt</option>
          <option value="REVOKED">Đã thu hồi</option>
        </Select>
        <Button type="submit">Lọc</Button>
      </form>
      <div className="card overflow-hidden">
        <WarrantyTable rows={result.items} hrefBase="/lab/warranties" showPatient={actor.role === "LAB_ADMIN"} />
        <Pager page={q.page} totalPages={totalPages} total={result.total} makeHref={(p) => hrefWith("/lab/warranties", sp, { page: p })} />
      </div>
    </div>
  );
}
