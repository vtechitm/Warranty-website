import type { UnitEntryKind } from "@prisma/client";
import { fmtDateTimeVN, fmtNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const UNIT_KIND: Record<UnitEntryKind, { label: string; tone: "green" | "blue" | "amber" | "gray" }> = {
  ALLOCATION: { label: "Cấp (mua phôi)", tone: "green" },
  ACTIVATION: { label: "Kích hoạt", tone: "blue" },
  REFUND: { label: "Hoàn lại", tone: "amber" },
  ADJUSTMENT: { label: "Điều chỉnh", tone: "gray" },
};

type Entry = {
  id: string; kind: UnitEntryKind; delta: number; balanceAfter: number; reference: string | null; note: string | null; createdAt: Date;
  laboratory: { code: string; name: string }; product: { sku: string; name: string };
};

/** Tooth-unit history table (admin and lab views). */
export function UnitLedgerTable({ items, showLab }: { items: Entry[]; showLab: boolean }) {
  if (items.length === 0) return <div className="px-5 py-8 text-center text-sm text-muted">Chưa có giao dịch đơn vị răng.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr><th>Thời gian</th>{showLab && <th>Labo</th>}<th>Phôi</th><th>Loại</th><th className="text-right">Thay đổi</th><th className="text-right">Còn lại</th><th>Số hoá đơn / ghi chú</th></tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-sm">{fmtDateTimeVN(e.createdAt)}</td>
              {showLab && <td className="text-sm">{e.laboratory.code} — {e.laboratory.name}</td>}
              <td className="text-sm">{e.product.name}<div className="text-xs text-muted">{e.product.sku}</div></td>
              <td><Badge tone={UNIT_KIND[e.kind].tone}>{UNIT_KIND[e.kind].label}</Badge></td>
              <td className={`text-right font-semibold ${e.delta < 0 ? "text-red-600" : "text-emerald-700"}`}>{e.delta > 0 ? "+" : ""}{fmtNumber(e.delta)}</td>
              <td className="text-right">{fmtNumber(e.balanceAfter)}</td>
              <td className="max-w-xs text-sm text-muted">{[e.reference, e.note].filter(Boolean).join(" · ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
