import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getActor, homeFor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  if (actor) redirect(homeFor(actor.role));
  const { next } = await searchParams;
  return <AuthShell title="Đăng nhập hệ thống" subtitle="Dành cho Vtech, thương hiệu và labo được ủy quyền"><LoginForm next={next} /></AuthShell>;
}
