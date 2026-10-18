import { requireActor } from "@/server/auth/session";
import { AdminNav } from "./admin-nav";
import { LogoutButton } from "@/components/logout-button";
import { ROLE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"], "/admin");
  const isSuper = actor.role === "SUPER_ADMIN";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="bg-navy-900 text-white lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-5">
            <div>
              <div className="text-sm font-bold tracking-[0.25em] text-gold-500">VTECH DENTAL</div>
              <div className="text-[11px] text-white/50">Warranty Platform</div>
            </div>
            <LogoutButton className="text-white/60 lg:hidden" label="" />
          </div>
          <AdminNav isSuper={isSuper} />
          <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
            <div className="truncate text-sm font-semibold">{actor.name}</div>
            <div className="truncate text-xs text-white/50">{ROLE_LABEL[actor.role]} · {actor.email}</div>
            <LogoutButton className="mt-3 text-white/60 hover:text-white" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
