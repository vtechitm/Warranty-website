import Link from "next/link";
import { z } from "zod";
import { requireActor } from "@/server/auth/session";
import { listClaims } from "@/server/services/claims";
import { paginationSchema } from "@/server/validation";
import { parseParams } from "@/lib/params";
import { CLAIM_STATUS_LABEL, fmtDateTimeVN } from "@/lib/format";
import { PageHeader, Pager, Empty, hrefWith } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { ClaimStatusControl } from "./claim-status";

export const metadata = { title: "Yêu cầu bảo hành" };

const schema = paginationSchema.extend({ status: z.enum(["SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED", "COMPLETED"]).optional() });

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["SUPER_ADMIN"]);
  const sp = await searchParams;
  const q = parseParams(schema, sp, { pageSize: 20 });
  const { items, total } = await listClaims(actor, q);
  return (
    <div>
      <PageHeader title="Yêu cầu bảo hành" description="Yêu cầu không bao giờ được duyệt tự động — mọi thay đổi trạng thái đều được lưu lịch sử." />
      <div className="mb-4 flex flex-wrap gap-2">
        {[undefined, ...Object.keys(CLAIM_STATUS_LABEL)].map((s) => (
          <Link key={s ?? "all"} href={hrefWith("/admin/claims", {}, { status: s })} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${q.status === s ? "bg-navy-900 text-white ring-navy-900" : "bg-white ring-line"}`}>
            {s ? CLAIM_STATUS_LABEL[s] : "Tất cả"}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {items.length === 0 && <div className="card"><Empty>Không có yêu cầu.</Empty></div>}
        {items.map((c) => (
          <section key={c.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{c.claimNumber}</span>
                  <StatusBadge status={c.status} label={CLAIM_STATUS_LABEL[c.status]} />
                </div>
                <div className="mt-1 text-sm text-muted">
                  <Link href={`/admin/warranties/${c.warrantyCode.code}`} className="mono text-navy-700 hover:underline">{c.warrantyCode.code}</Link> · {c.warrantyCode.product.name} · {fmtDateTimeVN(c.createdAt)}
                </div>
                <div className="mt-1 text-sm">{c.claimantName} ({c.claimantType}) · {c.contactPhone ?? "—"} · {c.contactEmail ?? ""}</div>
              </div>
              <ClaimStatusControl claimId={c.id} status={c.status} />
            </div>
            <p className="mt-3 whitespace-pre-line rounded-xl bg-surface p-3 text-sm">{c.description}</p>
            {c.images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.images.map((src, i) => (
                  <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block size-24 overflow-hidden rounded-xl ring-1 ring-line hover:ring-navy-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Ảnh ${i + 1} — ${c.claimNumber}`} loading="lazy" className="size-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {c.events.map((e) => <li key={e.id}>{fmtDateTimeVN(e.createdAt)}: {CLAIM_STATUS_LABEL[e.toStatus]}{e.note ? ` — ${e.note}` : ""}</li>)}
            </ol>
          </section>
        ))}
      </div>
      <div className="card mt-4"><Pager page={q.page} totalPages={Math.max(1, Math.ceil(total / q.pageSize))} total={total} makeHref={(p) => hrefWith("/admin/claims", sp, { page: p })} /></div>
    </div>
  );
}
