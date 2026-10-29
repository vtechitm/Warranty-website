"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Layers, Building2, ClipboardCheck, FileClock, LayoutDashboard, Package, ShieldCheck, Tags, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, superOnly: false },
  { href: "/admin/batches", label: "Lô mã QR", icon: Boxes, superOnly: false },
  { href: "/admin/warranties", label: "Mã bảo hành", icon: ShieldCheck, superOnly: false },
  { href: "/admin/units", label: "Đơn vị răng", icon: Layers, superOnly: true },
  { href: "/admin/laboratories", label: "Labo", icon: Building2, superOnly: false },
  { href: "/admin/brands", label: "Thương hiệu", icon: Tags, superOnly: false },
  { href: "/admin/products", label: "Sản phẩm (phôi)", icon: Package, superOnly: false },
  { href: "/admin/users", label: "Người dùng", icon: Users, superOnly: true },
  { href: "/admin/audit", label: "Nhật ký kiểm toán", icon: FileClock, superOnly: true },
  { href: "/api/v1/openapi.json", label: "API (OpenAPI)", icon: ClipboardCheck, superOnly: true },
];

export function AdminNav({ isSuper }: { isSuper: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {ITEMS.filter((i) => isSuper || !i.superOnly).map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            target={href.startsWith("/api") ? "_blank" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
              active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className={cn("size-4", active && "text-gold-500")} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
