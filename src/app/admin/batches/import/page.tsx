import { requireActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Nhập cấp mã từ Excel/CSV" };

export default async function ImportPage() {
  await requireActor(["SUPER_ADMIN"]);
  return (
    <div>
      <PageHeader
        title="Nhập cấp mã từ Excel / CSV"
        description="Tải lên danh sách mã bảo hành và mã labo nhận mã. Hệ thống kiểm tra toàn bộ trước khi cấp — không có thay đổi nào cho đến khi bạn xác nhận."
        back={{ href: "/admin/batches", label: "Lô mã QR" }}
      />
      <ImportWizard />
    </div>
  );
}
