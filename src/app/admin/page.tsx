import { Ban, Boxes, CheckCircle2, Clock, Hourglass, Percent, ShieldCheck, ShieldOff, Truck } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { adminDashboard } from "@/server/services/dashboard";
import { Kpi, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { fmtNumber, fmtPercent } from "@/lib/format";

export const metadata = { title: "Tổng quan" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const sp = await searchParams;
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+07:00`) : undefined);
  const to = valid(sp.to);
  const d = await adminDashboard(actor, { from: valid(sp.from), to: to ? new Date(to.getTime() + 86_399_999) : undefined });
  const k = d.kpis;
  const maxMonth = Math.max(1, ...d.monthly.map((m) => m.count));
  const maxLab = Math.max(1, ...d.topLabs.map((l) => l.count));
  const dist = d.statusDistribution;
  const distTotal = Math.max(1, dist.unused + dist.activated + dist.revoked);
  const segments = [
    { label: "Thẻ chưa dùng", value: dist.unused, color: "#cbd5e1" },
    { label: "Đã kích hoạt", value: dist.activated, color: "#0b1f3a" },
    { label: "Đã thu hồi", value: dist.revoked, color: "#ef4444" },
  ];

  return (
    <div>
      <PageHeader
        title="Tổng quan bảo hành"
        description="Số liệu toàn hệ thống theo phạm vi quyền của bạn."
        actions={
          <form className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">Từ<input type="date" name="from" defaultValue={sp.from} className="field mt-1 h-9 py-1 text-sm" /></label>
            <label className="text-xs text-muted">Đến<input type="date" name="to" defaultValue={sp.to} className="field mt-1 h-9 py-1 text-sm" /></label>
            <Button type="submit" size="sm" className="h-9">Lọc kích hoạt</Button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Thẻ đã sinh" value={fmtNumber(k.generated)} icon={<Boxes />} />
        <Kpi label="Đơn vị răng đã bán" value={fmtNumber(k.units.sold)} icon={<Truck />} sub={`đã dùng ${fmtNumber(k.units.used)} · còn ${fmtNumber(k.units.sold - k.units.used)}`} />
        <Kpi label="Đã kích hoạt" value={fmtNumber(k.activated)} icon={<CheckCircle2 />} sub={sp.from || sp.to ? `${fmtNumber(k.activatedInRange)} trong khoảng lọc` : undefined} />
        <Kpi label="Tỷ lệ kích hoạt" value={fmtPercent(k.activationRate)} icon={<Percent />} sub="trên số thẻ đã sinh" />
        <Kpi label="Bảo hành còn hiệu lực" value={fmtNumber(k.active)} icon={<ShieldCheck />} />
        <Kpi label="Đã hết hạn" value={fmtNumber(k.expired)} icon={<Clock />} />
        <Kpi label="Chờ xác nhận ngày lắp" value={fmtNumber(k.pendingInstallation)} icon={<Hourglass />} />
        <Kpi label="Mã đã thu hồi" value={fmtNumber(k.revoked)} icon={<Ban />} sub="Hiển thị cảnh báo khi quét QR" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="font-semibold">Kích hoạt theo tháng</h2>
          <p className="text-xs text-muted">12 tháng gần nhất</p>
          <div className="mt-6 flex h-56 items-end gap-2">
            {d.monthly.map((m) => (
              <div key={m.month} className="group flex flex-1 flex-col items-center gap-2">
                <div className="text-[11px] font-semibold text-ink opacity-0 transition group-hover:opacity-100">{fmtNumber(m.count)}</div>
                <div className="w-full rounded-t-lg bg-navy-900 transition group-hover:bg-gold-500" style={{ height: `${Math.max(2, (m.count / maxMonth) * 180)}px` }} title={`${m.month}: ${m.count}`} />
                <div className="text-[10px] text-muted">{m.month.slice(5)}/{m.month.slice(2, 4)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Phân bổ trạng thái mã</h2>
          <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-surface">
            {segments.map((s) => <div key={s.label} style={{ width: `${(s.value / distTotal) * 100}%`, background: s.color }} />)}
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: s.color }} /> {s.label}</span>
                <span className="font-semibold">{fmtNumber(s.value)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Top labo theo số kích hoạt</h2>
          <ul className="mt-4 space-y-3">
            {d.topLabs.length === 0 && <li className="text-sm text-muted">Chưa có dữ liệu.</li>}
            {d.topLabs.map((l) => (
              <li key={l.laboratory.id}>
                <div className="flex justify-between text-sm"><span className="truncate">{l.laboratory.name}</span><span className="font-semibold">{fmtNumber(l.count)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-surface"><div className="h-full rounded-full bg-gold-500" style={{ width: `${(l.count / maxLab) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Tỷ lệ kích hoạt theo sản phẩm</h2>
          <ul className="mt-4 space-y-3">
            {d.byProduct.length === 0 && <li className="text-sm text-muted">Chưa có dữ liệu.</li>}
            {d.byProduct.map((p) => (
              <li key={p.id}>
                <div className="flex justify-between text-sm"><span className="truncate">{p.name}</span><span className="text-muted">{fmtNumber(p.activated)}/{fmtNumber(p.total)} · <b className="text-ink">{fmtPercent(p.rate)}</b></span></div>
                <div className="mt-1 h-2 rounded-full bg-surface"><div className="h-full rounded-full bg-navy-900" style={{ width: `${p.rate * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Theo thương hiệu</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {d.byBrand.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: b.primaryColor }} /> {b.name}</span>
                <span><b>{fmtNumber(b.activated)}</b> <span className="text-muted">/ {fmtNumber(b.total)}</span></span>
              </li>
            ))}
            {d.byBrand.length === 0 && <li className="py-2 text-muted">Chưa có dữ liệu.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
