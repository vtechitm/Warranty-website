"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="green">Đã đặt mật khẩu thành công cho {email}.</Alert>
        <a href="/login" className="block">
          <Button size="lg" className="w-full">Đăng nhập</Button>
        </a>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("confirm")) return setError("Mật khẩu xác nhận không khớp");
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/auth/invitations/accept", { body: { token, password: f.get("password") } });
          setDone(true);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Mật khẩu mới" hint="Ít nhất 10 ký tự, gồm chữ và số">
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Nhập lại mật khẩu">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>Kích hoạt tài khoản</Button>
    </form>
  );
}
