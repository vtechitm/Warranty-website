import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { listSystemUsers } from "@/server/services/users";
import { listBrands } from "@/server/services/catalog";
import { fmtDateTimeVN, ROLE_LABEL } from "@/lib/format";
import { PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { FormDialog } from "@/components/form-dialog";
import { UserRowActions } from "./user-actions";

export const metadata = { title: "Người dùng" };

export default async function UsersPage() {
  const actor = await requireActor(["SUPER_ADMIN"]);
  const [users, brands] = await Promise.all([listSystemUsers(actor), listBrands(actor)]);
  return (
    <div>
      <PageHeader
        title="Người dùng hệ thống"
        description="Quản trị Vtech và quản trị thương hiệu. Tài khoản labo được quản lý trong từng labo."
        actions={
          <FormDialog
            trigger={<><Plus /> Thêm quản trị viên</>}
            title="Thêm quản trị viên"
            endpoint="/users"
            invitePath="invitation.path"
            submitLabel="Tạo & lấy link mời"
            fields={[
              { name: "name", label: "Họ tên", required: true },
              { name: "email", label: "Email", type: "email", required: true },
              { name: "role", label: "Vai trò", type: "select", required: true, defaultValue: "BRAND_ADMIN", options: [{ value: "BRAND_ADMIN", label: ROLE_LABEL.BRAND_ADMIN }, { value: "SUPER_ADMIN", label: ROLE_LABEL.SUPER_ADMIN }] },
              { name: "brandIds", label: "Thương hiệu (cho quản trị thương hiệu)", type: "checkboxes", options: brands.map((b) => ({ value: b.id, label: b.name })) },
            ]}
          />
        }
      />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Thương hiệu</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-sm">{u.email}</td>
                <td className="text-sm">{ROLE_LABEL[u.role]}</td>
                <td className="text-sm">{u.brands.map((b) => b.brand.name).join(", ") || "—"}</td>
                <td><StatusBadge status={u.status} label={u.status === "ACTIVE" ? "Hoạt động" : u.status === "INVITED" ? "Chờ kích hoạt" : "Đã khoá"} /></td>
                <td className="text-sm text-muted">{u.lastLoginAt ? fmtDateTimeVN(u.lastLoginAt) : "—"}</td>
                <td className="text-right">{u.id !== actor.userId && <UserRowActions userId={u.id} status={u.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
