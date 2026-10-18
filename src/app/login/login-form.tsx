"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

type LoginData = { user: { role: string } };

function home(role: string) {
  if (role === "SUPER_ADMIN" || role === "BRAND_ADMIN") return "/admin";
  if (role === "LAB_ADMIN" || role === "LAB_STAFF") return "/lab";
  return "/";
}

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setLoading(true);
        setError(null);
        try {
          const r = await apiFetch<LoginData>("/auth/login", { body: { email: f.get("email"), password: f.get("password"), client: "web" } });
          // Only same-site relative redirects are honoured.
          const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
          window.location.href = safeNext ?? home(r.user.role);
        } catch (err) {
          setError((err as Error).message);
          setLoading(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Mật khẩu">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <LogIn /> Đăng nhập
      </Button>
    </form>
  );
}
