import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { getLaboratory, listStaff } from "@/server/services/laboratories";
import { listBrands } from "@/server/services/catalog";
import { can } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { fmtNumber } from "@/lib/format";
import { Kpi, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { FormDialog } from "@/components/form-dialog";
import { StaffManager } from "@/components/staff-manager";

export const metadata = { title: "Chi tiết labo" };

export default async function LabDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const { id } = await params;
  let lab;
  try {
    lab = await getLaboratory(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const manage = can(actor.role, "laboratory:manage");
  const [brands, staff] = await Promise.all([listBrands(actor), manage ? listStaff(actor, id) : Promise.resolve([])]);
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/laboratories", label: "Labo" }}
        title={lab.name}
        description={<>{lab.code} · {lab.address ?? "Chưa có địa chỉ"}</>}
        actions={
          <>
            <StatusBadge status={lab.status} label={lab.status === "ACTIVE" ? "Hoạt động" : "Tạm ngưng"} />
            {manage && (
              <FormDialog
                trigger={<><Pencil /> Sửa</>}
                triggerVariant="outline"
                title="Cập nhật labo"
                endpoint={`/laboratories/${lab.id}`}
                method="PATCH"
                wide
                keepNulls
                fields={[
                  { name: "name", label: "Tên labo", required: true, defaultValue: lab.name, full: true },
                  { name: "address", label: "Địa chỉ", defaultValue: lab.address ?? "", full: true },
                  { name: "contactPerson", label: "Người liên hệ", defaultValue: lab.contactPerson ?? "" },
                  { name: "phone", label: "Điện thoại", defaultValue: lab.phone ?? "" },
                  { name: "email", label: "Email", type: "email", defaultValue: lab.email ?? "" },
                  { name: "taxCode", label: "Mã số thuế", defaultValue: lab.taxCode ?? "" },
                  { name: "status", label: "Trạng thái", type: "select", required: true, defaultValue: lab.status, options: [{ value: "ACTIVE", label: "Hoạt động" }, { value: "SUSPENDED", label: "Tạm ngưng (đăng xuất mọi tài khoản)" }] },
                  { name: "brandIds", label: "Thương hiệu được ủy quyền", type: "checkboxes", defaultValue: lab.brands.map((b) => b.brandId), options: brands.map((b) => ({ value: b.id, label: b.name })) },
                ]}
              />
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Đơn vị răng còn lại" value={fmtNumber(lab.stats.unitsLeft)} sub={<a className="text-navy-700 underline" href={`/admin/units?laboratoryId=${lab.id}`}>Cấp / lịch sử</a>} />
        <Kpi label="Ca đã kích hoạt" value={fmtNumber(lab.stats.activated)} />
        <Kpi label="Thương hiệu" value={lab.brands.length} sub={lab.brands.map((b) => b.brand.name).join(", ")} />
      </div>
      <div className="card grid gap-4 p-5 text-sm sm:grid-cols-4">
        <div><div className="text-muted">Người liên hệ</div><div className="font-medium">{lab.contactPerson ?? "—"}</div></div>
        <div><div className="text-muted">Điện thoại</div><div className="font-medium">{lab.phone ?? "—"}</div></div>
        <div><div className="text-muted">Email</div><div className="font-medium">{lab.email ?? "—"}</div></div>
        <div><div className="text-muted">Lịch sử kích hoạt</div><Link className="font-medium text-navy-700 hover:underline" href={`/admin/warranties?laboratoryId=${lab.id}&status=ACTIVATED`}>Xem các ca đã kích hoạt →</Link></div>
      </div>
      {manage && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Tài khoản labo</h2>
          <StaffManager laboratoryId={lab.id} staff={JSON.parse(JSON.stringify(staff))} selfId={actor.userId} />
        </section>
      )}
    </div>
  );
}
