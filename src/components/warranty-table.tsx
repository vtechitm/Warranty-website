import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/misc";
import { fmtDate, fmtDateTimeVN, LIFECYCLE_LABEL } from "@/lib/format";
import type { searchCodes } from "@/server/services/warranty-codes";

type Row = Awaited<ReturnType<typeof searchCodes>>["items"][number];

export function WarrantyTable({ rows, hrefBase, showLab, showPatient }: { rows: Row[]; hrefBase: string; showLab?: boolean; showPatient?: boolean }) {
  if (rows.length === 0) return <Empty>Không có mã bảo hành phù hợp.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Mã bảo hành</th>
            <th>Sản phẩm</th>
            <th>Trạng thái</th>
            {showLab && <th>Labo</th>}
            <th>Phòng khám</th>
            {showPatient && <th>Bệnh nhân</th>}
            <th>Kích hoạt</th>
            <th>Hết hạn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`${hrefBase}/${r.code}`} className="mono font-semibold text-navy-800 hover:underline">{r.code}</Link>
                <div className="text-xs text-muted">{r.batch.batchNumber} · #{r.serial}</div>
              </td>
              <td>
                <div>{r.product.name}</div>
                <div className="text-xs text-muted">{r.brand.name}</div>
              </td>
              <td>
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge status={r.status} label={LIFECYCLE_LABEL[r.status]} />
                  {r.case?.installationStatus === "PENDING_CONFIRMATION" && !r.revokedAt && <StatusBadge status="PENDING_CONFIRMATION" label="Chờ ngày lắp" />}
                </div>
              </td>
              {showLab && <td className="text-sm">{r.assignedLaboratory?.name ?? <span className="text-muted">—</span>}</td>}
              <td className="text-sm">{r.case?.clinicName ?? <span className="text-muted">—</span>}</td>
              {showPatient && <td className="text-sm">{r.case?.patient.fullName ?? <span className="text-muted">—</span>}</td>}
              <td className="whitespace-nowrap text-sm">{r.activatedAt ? fmtDateTimeVN(r.activatedAt) : <span className="text-muted">—</span>}</td>
              <td className="whitespace-nowrap text-sm">{r.case?.warrantyEndDate ? fmtDate(r.case.warrantyEndDate) : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
