import Link from "next/link";
import { History, Home, QrCode, Users } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { LogoutButton } from "@/components/logout-button";
import { ROLE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor(["LAB_ADMIN", "LAB_STAFF"], "/lab");
  const lab = await prisma.laboratory.findUniqueOrThrow({ where: { id: actor.laboratoryId! }, select: { name: true, code: true } });
  const nav = [
    { href: "/lab", label: "Trang chủ", icon: Home },
    { href: "/lab/activate", label: "Kích hoạt", icon: QrCode },
    { href: "/lab/warranties", label: "Lịch sử", icon: History },
    ...(actor.role === "LAB_ADMIN" ? [{ href: "/lab/staff", label: "Nhân sự", icon: Users }] : []),
  ];
  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900 text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/lab" className="min-w-0">
            <div className="truncate text-sm font-bold">{lab.name}</div>
            <div className="text-[11px] text-white/50">{lab.code} · {actor.name} · {ROLE_LABEL[actor.role]}</div>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">{n.label}</Link>
            ))}
            <LogoutButton className="ml-2 rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/10" label="" />
          </nav>
          <LogoutButton className="text-white/60 sm:hidden" label="" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted active:text-navy-900">
            <Icon className="size-5" /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
