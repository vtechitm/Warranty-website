import { requireActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { UnitImportWizard } from "./import-wizard";

export const metadata = { title: "Nhập cấp đơn vị răng" };

export default async function UnitImportPage() {
  await requireActor(["SUPER_ADMIN"]);
  return (
    <div>
      <PageHeader
        title="Nhập cấp đơn vị răng từ Excel / CSV"
        description="Mỗi dòng là một lần labo mua phôi: mã labo, mã phôi (SKU), số đơn vị răng, số hoá đơn. Hệ thống kiểm tra toàn bộ trước; khi xác nhận, tất cả các dòng được ghi cùng lúc (hoặc không dòng nào)."
        back={{ href: "/admin/units", label: "Đơn vị răng" }}
      />
      <UnitImportWizard />
    </div>
  );
}
