"use client";

import { LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export function LogoutButton({ className, label = "Đăng xuất" }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
        window.location.href = "/login";
      }}
      className={cn("inline-flex items-center gap-2 text-sm", className)}
    >
      <LogOut className="size-4" /> {label}
    </button>
  );
}
