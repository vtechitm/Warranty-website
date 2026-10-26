"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** Warranty lookup box (landing page & embeddable widget). Opens /w/{code}. */
export function LookupForm({ target = "_self", compact = false, accent = "#C9A96E" }: { target?: "_self" | "_blank" | "_top"; compact?: boolean; accent?: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase().replace(/\s+/g, "");
        if (!/^(?:[A-Z]{2,4}\d{8}|[A-Z]{2,4}\d{2}-[A-Z0-9]{8})$/.test(c)) {
          setError("Mã bảo hành có dạng OR48291037 (2 chữ cái + 8 chữ số)");
          return;
        }
        setError(null);
        window.open(`/w/${encodeURIComponent(c)}`, target);
      }}
      className="w-full"
    >
      <div className={cn("flex gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/5", compact && "shadow-none")}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Nhập mã bảo hành, VD: OR48291037"
          className="mono min-w-0 flex-1 rounded-xl px-3 text-base uppercase text-ink outline-none placeholder:normal-case placeholder:tracking-normal"
          aria-label="Mã bảo hành"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" className="inline-flex h-12 items-center gap-2 rounded-xl px-5 font-semibold text-[#050f1f]" style={{ background: accent }}>
          <Search className="size-5" /> <span className="hidden sm:inline">Tra cứu</span>
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-300">{error}</p>}
    </form>
  );
}
