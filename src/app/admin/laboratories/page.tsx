import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listLaboratories } from "@/server/services/laboratories";
import { listBrands } from "@/server/services/catalog";
import { can } from "@/server/auth/permissions";
import { fmtNumber } from "@/lib/format";
import { PageHeader, Pager, Empty, hrefWith } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { FormDialog } from "@/components/form-dialog";

export const metadata = { title: "Labo" };

export default async function LabsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ items, total }, brands] = await Promise.all([listLaboratories(actor, { q: sp.q, page, pageSize: 25 }), listBrands(actor)]);
  return (
    <div>
      <PageHeader
        title="Labo được ủy quyền"
        description="Chỉ labo có tài khoản Vtech cấp mới được kích hoạt bảo hành."
        actions={
          can(actor.role, "laboratory:manage") && (
            <FormDialog
              trigger={<><Plus /> Thêm labo</>}
              title="Thêm labo mới"
              description="Hệ thống tạo liên kết mời cho quản lý labo — không gửi mật khẩu."
              endpoint="/laboratories"
              wide
              invitePath="invitation.path"
              submitLabel="Tạo labo"
              fields={[
                { name: "name", label: "Tên labo", required: true, full: true },
                { name: "address", label: "Địa chỉ", full: true },
                { name: "contactPerson", label: "Người liên hệ" },
                { name: "phone", label: "Điện thoại" },
                { name: "email", label: "Email labo", type: "email" },
                { name: "taxCode", label: "Mã số thuế" },
                { name: "brandIds", label: "Thương hiệu được ủy quyền", type: "checkboxes", options: brands.map((b) => ({ value: b.id, label: b.name })) },
                { name: "admin.name", label: "Họ tên quản lý labo", required: true },
                { name: "admin.email", label: "Email đăng nhập của quản lý", type: "email", required: true },
              ]}
            />
          )
        }
      />
      <form className="card mb-4 flex gap-3 p-4">
        <input name="q" defaultValue={sp.q} placeholder="Tìm theo tên, mã labo, SĐT" className="field" />
        <button className="rounded-xl bg-navy-900 px-5 text-sm font-semibold text-white">Tìm</button>
      </form>
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <Empty>Chưa có labo.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Labo</th><th>Liên hệ</th><th>Thương hiệu</th><th className="text-right">Mã được cấp</th><th className="text-right">Đã kích hoạt</th><th className="text-right">Tài khoản</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/admin/laboratories/${l.id}`} className="font-semibold text-navy-800 hover:underline">{l.name}</Link><div className="text-xs text-muted">{l.code}</div></td>
                    <td className="text-sm">{l.contactPerson ?? "—"}<div className="text-xs text-muted">{l.phone}</div></td>
                    <td className="text-sm">{l.brands.map((b) => b.brand.name).join(", ") || "—"}</td>
                    <td className="text-right">{fmtNumber(l._count.codes)}</td>
                    <td className="text-right">{fmtNumber(l._count.activations)}</td>
                    <td className="text-right">{l._count.users}</td>
                    <td><StatusBadge status={l.status} label={l.status === "ACTIVE" ? "Hoạt động" : "Tạm ngưng"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} totalPages={Math.max(1, Math.ceil(total / 25))} total={total} makeHref={(p) => hrefWith("/admin/laboratories", sp, { page: p })} />
      </div>
    </div>
  );
}
