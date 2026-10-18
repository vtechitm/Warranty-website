import { requireActor } from "@/server/auth/session";
import { listStaff } from "@/server/services/laboratories";
import { PageHeader } from "@/components/ui/misc";
import { StaffManager } from "@/components/staff-manager";

export const metadata = { title: "Nhân sự labo" };

export default async function LabStaffPage() {
  const actor = await requireActor(["LAB_ADMIN"]);
  const staff = await listStaff(actor, actor.laboratoryId!);
  return (
    <div>
      <PageHeader title="Nhân sự labo" description="Mời nhân viên bằng liên kết kích hoạt an toàn — hệ thống không gửi mật khẩu." />
      <StaffManager laboratoryId={actor.laboratoryId!} staff={JSON.parse(JSON.stringify(staff))} selfId={actor.userId} />
    </div>
  );
}
