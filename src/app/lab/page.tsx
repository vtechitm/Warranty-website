import Link from "next/link";
import { CheckCircle2, ClipboardList, Hourglass, Keyboard, QrCode } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { labDashboard } from "@/server/services/dashboard";
import { Kpi, Empty } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { fmtDate, fmtDateTimeVN, fmtNumber } from "@/lib/format";

export const metadata = { title: "Labo" };

export default async function LabHome() {
  const actor = await requireActor(["LAB_ADMIN", "LAB_STAFF"]);
  const d = await labDashboard(actor);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/lab/activate?mode=scan" className="group flex min-h-28 items-center gap-4 rounded-3xl bg-navy-900 p-6 text-white shadow-lg shadow-navy-900/20 transition active:scale-[0.99]">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gold-500 text-navy-950">
            <QrCode className="size-9" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">QUÉT QR – KÍCH HOẠT BẢO HÀNH</div>
            <div className="mt-1 text-sm text-white/60">Dùng camera điện thoại quét thẻ bảo hành</div>
          </div>
        </Link>
        <Link href="/lab/activate?mode=manual" className="flex min-h-28 items-center gap-4 rounded-3xl border-2 border-navy-900 bg-white p-6 text-navy-900 transition active:scale-[0.99]">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-surface">
            <Keyboard className="size-8" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">NHẬP MÃ BẢO HÀNH</div>
            <div className="mt-1 text-sm text-muted">Gõ mã in trên thẻ, VD: OR48291037</div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Mã được cấp" value={fmtNumber(d.assigned)} icon={<ClipboardList />} />
        <Kpi label="Chưa kích hoạt" value={fmtNumber(d.unactivated)} icon={<QrCode />} />
        <Kpi label="Đã kích hoạt" value={fmtNumber(d.activated)} icon={<CheckCircle2 />} />
        <Kpi label="Chờ ngày lắp" value={fmtNumber(d.pendingInstallation)} icon={<Hourglass />} sub={d.pendingInstallation ? <Link className="text-navy-700 underline" href="/lab/warranties?pending=1">Xác nhận ngay</Link> : undefined} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold">Kích hoạt gần đây</h2>
          <Link href="/lab/warranties" className="text-sm text-navy-700 hover:underline">Xem tất cả</Link>
        </div>
        {d.recent.length === 0 ? (
          <Empty>Chưa có bảo hành nào được kích hoạt.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {d.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/lab/warranties/${r.warrantyCode.code}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface">
                  <div className="min-w-0">
                    <div className="mono font-semibold">{r.warrantyCode.code}</div>
                    <div className="truncate text-xs text-muted">
                      {r.warrantyCode.product.name} · {r.case?.unitCount ?? 0} răng · {r.case?.clinicName ?? "—"} · {fmtDateTimeVN(r.activatedAt)}
                    </div>
                  </div>
                  {r.warrantyCode.revokedAt ? (
                    <StatusBadge status="REVOKED" label="Đã thu hồi" />
                  ) : r.case?.installationStatus === "PENDING_CONFIRMATION" ? (
                    <StatusBadge status="PENDING_CONFIRMATION" label="Chờ ngày lắp" />
                  ) : (
                    <span className="shrink-0 text-xs text-muted">HSD {fmtDate(r.case?.warrantyEndDate)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
