import { StatusBadge } from "@/components/ui/badge";
import { ToothChart } from "@/components/tooth-chart";
import { fmtDate, fmtDateTimeVN, fmtDuration, lastCoveredDay, LIFECYCLE_LABEL, PUBLIC_STATE_LABEL, START_RULE_LABEL, VALIDITY_LABEL } from "@/lib/format";
import { lifecycleStatus } from "@/server/services/validity";
import type { WarrantyDetail } from "@/server/services/activation";
import { WarrantyActions } from "./warranty-actions";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children ?? "—"}</dd>
    </div>
  );
}

export function WarrantyDetailView({ d, mode, canCorrect }: { d: WarrantyDetail; mode: "admin" | "lab"; canCorrect: boolean }) {
  const c = d.case;
  const status = lifecycleStatus(d);
  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/v1/warranties/${encodeURIComponent(d.code)}/qr?size=300`} alt="" className="size-20 rounded-lg ring-1 ring-line" />
          <div>
            <div className="mono text-xl font-bold text-navy-900">{d.code}</div>
            <div className="text-sm text-muted">{d.brand.name} · {d.product.name}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={status} label={LIFECYCLE_LABEL[status]} />
              <StatusBadge status={d.publicState} label={PUBLIC_STATE_LABEL[d.publicState]} />
            </div>
          </div>
        </div>
        <WarrantyActions
          code={d.code}
          mode={mode}
          canCorrect={canCorrect && !!c}
          activated={!!c}
          revoked={!!d.revokedAt}
          suspended={!!c?.suspendedAt}
          pendingInstallation={c?.installationStatus === "PENDING_CONFIRMATION"}
          current={c ? { patientName: c.patient?.fullName ?? "", patientPhone: c.patient?.phone ?? "", clinicName: c.clinicName ?? "", dentistName: c.dentistName ?? "", notes: c.notes ?? "" } : null}
        />
      </div>

      {d.revokedAt && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          <b>Đã thu hồi</b> lúc {fmtDateTimeVN(d.revokedAt)} — {d.revokedReason}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Bảo hành</h2>
          <dl className="divide-y divide-line">
            <Row label="Hiệu lực">{c ? VALIDITY_LABEL[d.validity] : "—"}</Row>
            <Row label="Thời hạn">{c ? fmtDuration(c.policy.durationMonths) : "—"}</Row>
            <Row label="Quy tắc bắt đầu">{c ? START_RULE_LABEL[c.policy.startRule] : "—"}</Row>
            <Row label="Bắt đầu">{c?.warrantyStartDate ? fmtDate(c.warrantyStartDate) : c ? "Chờ xác nhận ngày lắp" : "—"}</Row>
            <Row label="Hiệu lực đến hết">{c?.warrantyEndDate ? fmtDate(lastCoveredDay(c.warrantyEndDate)) : "—"}</Row>
            <Row label="Chính sách">{c ? `Phiên bản ${c.policy.version}` : "—"}</Row>
            <Row label="Kích hoạt">{d.activation ? `${fmtDateTimeVN(d.activation.activatedAt)} · ${d.activation.activatedBy}` : "—"}</Row>
            {c?.suspendedAt && <Row label="Tạm ngưng">{`${fmtDateTimeVN(c.suspendedAt)} — ${c.suspendedReason ?? ""}`}</Row>}
            <Row label="Lô / serial">{`${d.batchNumber} · #${d.serial}`}</Row>
            {mode === "admin" && <Row label="Labo kích hoạt">{c ? `${c.laboratory.code} — ${c.laboratory.name}` : "Chưa kích hoạt"}</Row>}
            <Row label="URL QR"><a href={d.url} target="_blank" className="break-all text-navy-700 hover:underline">{d.url}</a></Row>
          </dl>
        </section>

        {c && (
          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Ca phục hình</h2>
            <dl className="divide-y divide-line">
              {c.patient && <Row label="Bệnh nhân">{c.patient.fullName}{c.patient.birthYear ? ` (${c.patient.birthYear})` : ""}</Row>}
              {c.patient && <Row label="SĐT bệnh nhân">{c.patient.phone}</Row>}
              {c.patient?.externalRef && <Row label="Mã BN">{c.patient.externalRef}</Row>}
              <Row label="Phòng khám">{c.clinicName}</Row>
              <Row label="Bác sĩ">{c.dentistName}</Row>
              <Row label="Loại phục hình">{c.restorationType}</Row>
              <Row label="Hoàn thành">{fmtDate(c.completionDate)}</Row>
              <Row label="Ngày lắp">{c.installationDate ? fmtDate(c.installationDate) : "Chưa xác nhận"}</Row>
              {mode === "admin" && <Row label="Labo kích hoạt">{c.laboratory.name}</Row>}
              {c.accessCode && <Row label="Mã xác thực BN"><span className="mono">{c.accessCode}</span></Row>}
              {c.notes && <Row label="Ghi chú">{c.notes}</Row>}
            </dl>
          </section>
        )}
      </div>

      {c && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Vị trí răng ({c.unitCount} đơn vị)</h2>
          <ToothChart selected={c.units.map((u) => u.toothNumber)} readOnly accent={d.brand.primaryColor} showPrimary={c.units.some((u) => u.toothNumber > 50)} />
          <div className="mt-4 overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Răng</th><th>Loại</th><th>Shade</th><th>Lô vật liệu</th></tr></thead>
              <tbody>
                {c.units.map((u) => (
                  <tr key={u.toothNumber}><td className="font-semibold">{u.toothNumber}</td><td>{u.restorationType}</td><td>{u.shade ?? "—"}</td><td>{u.lotNumber ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
}
