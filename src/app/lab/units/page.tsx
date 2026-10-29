import { requireActor } from "@/server/auth/session";
import { listUnitBalances, listUnitLedger } from "@/server/services/units";
import { fmtNumber } from "@/lib/format";
import { Pager, hrefWith } from "@/components/ui/misc";
import { UnitLedgerTable } from "@/components/unit-ledger";

export const metadata = { title: "Đơn vị răng" };

export default async function LabUnitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["LAB_ADMIN", "LAB_STAFF"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [balances, ledger] = await Promise.all([listUnitBalances(actor), listUnitLedger(actor, { page, pageSize: 30 })]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Đơn vị răng</h1>
        <p className="mt-1 text-sm text-muted">Số răng labo còn được kích hoạt theo từng loại phôi đã mua. Mỗi ca kích hoạt trừ đúng số răng của ca. Cần thêm: liên hệ Vtech để mua phôi.</p>
      </div>
      {balances.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Labo chưa có đơn vị răng nào.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {balances.map((b) => (
            <div key={b.product.id} className="card p-4">
              <div className="text-sm text-muted">{b.product.brand.name}</div>
              <div className="font-semibold">{b.product.name}</div>
              <div className={`mt-2 text-3xl font-bold ${b.balance <= 5 ? "text-red-600" : "text-navy-900"}`}>{fmtNumber(b.balance)} <span className="text-sm font-normal text-muted">răng còn lại</span></div>
              <div className="mt-1 text-xs text-muted">Đã mua {fmtNumber(b.allocated)} · đã dùng {fmtNumber(b.used)}</div>
            </div>
          ))}
        </div>
      )}
      <section className="card overflow-hidden">
        <h2 className="px-5 py-4 font-semibold">Lịch sử</h2>
        <UnitLedgerTable items={ledger.items} showLab={false} />
        <Pager page={page} totalPages={Math.max(1, Math.ceil(ledger.total / 30))} total={ledger.total} makeHref={(p) => hrefWith("/lab/units", sp, { page: p })} />
      </section>
    </div>
  );
}
