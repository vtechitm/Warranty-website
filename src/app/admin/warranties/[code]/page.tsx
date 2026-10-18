import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getWarrantyDetail } from "@/server/services/activation";
import { listAuditLogs } from "@/server/services/audit";
import { AppError } from "@/server/errors";
import { fmtDateTimeVN } from "@/lib/format";
import { PageHeader } from "@/components/ui/misc";
import { WarrantyDetailView } from "@/components/warranty-detail";

export const metadata = { title: "Hồ sơ bảo hành" };

export default async function AdminWarrantyDetail({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const { code } = await params;
  let d;
  try {
    d = await getWarrantyDetail(actor, decodeURIComponent(code));
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const history = actor.role === "SUPER_ADMIN" ? await listAuditLogs({ page: 1, pageSize: 50, entityId: d.id }) : null;
  const caseHistory = actor.role === "SUPER_ADMIN" && d.case ? await listAuditLogs({ page: 1, pageSize: 50, entityId: d.case.id }) : null;
  const events = [...(history?.items ?? []), ...(caseHistory?.items ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div>
      <PageHeader title="Hồ sơ bảo hành" back={{ href: "/admin/warranties", label: "Mã bảo hành" }} />
      <WarrantyDetailView d={d} mode="admin" canCorrect={actor.role === "SUPER_ADMIN"} />
      {events.length > 0 && (
        <section className="card mt-5 p-5">
          <h2 className="mb-3 font-semibold">Lịch sử thay đổi</h2>
          <ol className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 border-l-2 border-gold-500 pl-3">
                <span className="text-muted">{fmtDateTimeVN(e.createdAt)}</span>
                <span className="font-mono text-xs font-semibold">{e.action}</span>
                <span>{e.actor?.name ?? "Hệ thống"}</span>
                {(e.metadata as { reason?: string })?.reason && <span className="text-muted">— {(e.metadata as { reason?: string }).reason}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
