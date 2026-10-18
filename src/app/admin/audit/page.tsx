import { requireActor } from "@/server/auth/session";
import { listAuditLogs } from "@/server/services/audit";
import { fmtDateTimeVN, ROLE_LABEL } from "@/lib/format";
import { PageHeader, Pager, hrefWith } from "@/components/ui/misc";

export const metadata = { title: "Nhật ký kiểm toán" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireActor(["SUPER_ADMIN"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total } = await listAuditLogs({ page, pageSize: 50, action: sp.action?.slice(0, 50), entityType: sp.entityType?.slice(0, 50) });
  return (
    <div>
      <PageHeader title="Nhật ký kiểm toán" description="Mọi kích hoạt, thay đổi quản trị, xuất dữ liệu và truy cập hồ sơ riêng tư. Không thể sửa hoặc xoá." />
      <form className="card mb-4 flex flex-wrap gap-3 p-4">
        <input name="action" defaultValue={sp.action} placeholder="Hành động, VD: warranty.activate" className="field max-w-xs" />
        <select name="entityType" defaultValue={sp.entityType ?? ""} className="field max-w-xs">
          <option value="">Mọi đối tượng</option>
          {["WarrantyCode", "WarrantyBatch", "RestorationCase", "Laboratory", "Brand", "BrandDomain", "Product", "WarrantyPolicy", "User", "WarrantyClaim"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="rounded-xl bg-navy-900 px-5 text-sm font-semibold text-white">Lọc</button>
      </form>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th><th>IP</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-sm">{fmtDateTimeVN(l.createdAt)}</td>
                  <td className="text-sm">{l.actor?.name ?? "Hệ thống / công khai"}<div className="text-xs text-muted">{l.actorRole ? ROLE_LABEL[l.actorRole] : ""}</div></td>
                  <td><span className="font-mono text-xs font-semibold">{l.action}</span></td>
                  <td className="text-xs text-muted">{l.entityType}<div className="font-mono">{l.entityId?.slice(0, 8)}</div></td>
                  <td className="max-w-md truncate font-mono text-xs text-muted" title={JSON.stringify(l.metadata)}>{JSON.stringify(l.metadata)}</td>
                  <td className="text-xs text-muted">{l.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={Math.max(1, Math.ceil(total / 50))} total={total} makeHref={(p) => hrefWith("/admin/audit", sp, { page: p })} />
      </div>
    </div>
  );
}
