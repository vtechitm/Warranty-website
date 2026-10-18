import { getInvitation } from "@/server/auth/auth-service";
import { Alert } from "@/components/ui/field";
import { AuthShell } from "@/components/auth-shell";
import { AcceptInviteForm } from "./accept-form";

export const metadata = { title: "Kích hoạt tài khoản" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvitation(token);
  return (
    <AuthShell title="Kích hoạt tài khoản" subtitle={inv ? `Xin chào ${inv.name} — đặt mật khẩu cho ${inv.email}` : "Liên kết mời"}>
      {inv ? <AcceptInviteForm token={token} email={inv.email} /> : <Alert>Liên kết mời không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ quản trị viên để được cấp lại.</Alert>}
    </AuthShell>
  );
}
