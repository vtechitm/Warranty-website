"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Field, Input, Select } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { fmtDateTimeVN, ROLE_LABEL } from "@/lib/format";

type Staff = { id: string; name: string; email: string; phone: string | null; role: string; status: string; lastLoginAt: string | null };

export function InviteLink({ path }: { path: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <Alert tone="green">Gửi liên kết này cho người dùng qua kênh an toàn (Zalo/email). Liên kết dùng một lần, hết hạn sau 7 ngày.</Alert>
      <div className="flex gap-2">
        <input readOnly value={url} className="field mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); }}><Copy /> {copied ? "Đã chép" : "Chép"}</Button>
      </div>
    </div>
  );
}

export function StaffManager({ laboratoryId, staff, selfId }: { laboratoryId: string; staff: Staff[]; selfId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setOpen(true); setInvite(null); setError(null); }}><UserPlus /> Mời nhân sự</Button>
      </div>
      {error && !open && <Alert>{error}</Alert>}
      {invite && !open && <div className="card p-4"><InviteLink path={invite} /></div>}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td className="text-sm">{s.email}</td>
                <td className="text-sm">{ROLE_LABEL[s.role]}</td>
                <td><StatusBadge status={s.status} label={s.status === "ACTIVE" ? "Hoạt động" : s.status === "INVITED" ? "Chờ kích hoạt" : "Đã khoá"} /></td>
                <td className="text-sm text-muted">{s.lastLoginAt ? fmtDateTimeVN(s.lastLoginAt) : "—"}</td>
                <td className="text-right">
                  {s.id !== selfId && (
                    <div className="flex justify-end gap-1">
                      {s.status === "INVITED" && (
                        <Button size="sm" variant="ghost" onClick={() => act(async () => setInvite((await apiFetch<{ path: string }>(`/users/${s.id}/invitation`, { method: "POST" })).path))}>
                          <Link2 /> Link mời
                        </Button>
                      )}
                      {s.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => act(() => apiFetch(`/users/${s.id}/status`, { body: { status: "SUSPENDED" } }))}>Khoá</Button>}
                      {s.status === "SUSPENDED" && <Button size="sm" variant="ghost" onClick={() => act(() => apiFetch(`/users/${s.id}/status`, { body: { status: "ACTIVE" } }))}>Mở khoá</Button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onClose={() => { setOpen(false); router.refresh(); }} title="Mời nhân sự labo">
        {invite ? (
          <InviteLink path={invite} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setLoading(true);
              setError(null);
              try {
                const r = await apiFetch<{ invitation: { path: string } }>(`/laboratories/${laboratoryId}/staff`, {
                  body: { name: f.get("name"), email: f.get("email"), phone: f.get("phone") || null, role: f.get("role") },
                });
                setInvite(r.invitation.path);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {error && <Alert>{error}</Alert>}
            <Field label="Họ tên *"><Input name="name" required /></Field>
            <Field label="Email *"><Input name="email" type="email" required /></Field>
            <Field label="Số điện thoại"><Input name="phone" inputMode="tel" /></Field>
            <Field label="Vai trò">
              <Select name="role" defaultValue="LAB_STAFF">
                <option value="LAB_STAFF">Nhân viên labo — kích hoạt bảo hành</option>
                <option value="LAB_ADMIN">Quản lý labo — toàn quyền labo</option>
              </Select>
            </Field>
            <Button type="submit" className="w-full" loading={loading}>Tạo liên kết mời</Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
