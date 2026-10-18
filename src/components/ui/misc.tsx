import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions, back }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, icon, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card p-5", className)}>
      <div className="flex items-center justify-between text-sm font-medium text-muted">
        {label}
        {icon && <span className="text-gold-600 [&_svg]:size-5">{icon}</span>}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-14 text-center text-sm text-muted">{children}</div>;
}

export function Pager({ page, totalPages, total, makeHref }: { page: number; totalPages: number; total: number; makeHref: (p: number) => string }) {
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>{new Intl.NumberFormat("vi-VN").format(total)} bản ghi</span>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} className={cn("rounded-lg p-1.5 hover:bg-surface", page <= 1 && "pointer-events-none opacity-40")} href={makeHref(page - 1)}>
          <ChevronLeft className="size-4" />
        </Link>
        <span className="px-2">
          Trang {page}/{totalPages}
        </span>
        <Link aria-disabled={page >= totalPages} className={cn("rounded-lg p-1.5 hover:bg-surface", page >= totalPages && "pointer-events-none opacity-40")} href={makeHref(page + 1)}>
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/** Builds a URL with updated search params (server-rendered filters & pagination). */
export function hrefWith(base: string, params: Record<string, string | undefined>, patch: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
