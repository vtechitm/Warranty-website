"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

type Domain = { id: string; hostname: string; isPrimary: boolean; verifiedAt: string | null; verificationToken: string; redirectToPrimary: boolean };

export function DomainManager({ brandId, domains, manage }: { brandId: string; domains: Domain[]; manage: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">Tên miền bảo hành</div>
      {error && <div className="mb-2"><Alert>{error}</Alert></div>}
      <ul className="space-y-2">
        {domains.length === 0 && <li className="text-sm text-muted">Chưa cấu hình — mã dùng URL mặc định của nền tảng.</li>}
        {domains.map((d) => (
          <li key={d.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium"><Globe className="size-4 text-muted" /> {d.hostname}</span>
              <span className="flex gap-1">
                {d.isPrimary && <Badge tone="navy">Chính</Badge>}
                {d.redirectToPrimary && <Badge tone="blue">Chuyển hướng</Badge>}
                {d.verifiedAt ? <Badge tone="green">Đã xác minh</Badge> : <Badge tone="amber">Chưa xác minh</Badge>}
              </span>
            </div>
            {!d.verifiedAt && (
              <div className="mt-2 text-xs text-muted">
                Thêm bản ghi DNS TXT <span className="mono rounded bg-surface px-1">_vtech-verify.{d.hostname}</span> = <span className="mono rounded bg-surface px-1">{d.verificationToken}</span>, sau đó bấm xác minh.
              </div>
            )}
            {manage && (
              <div className="mt-2 flex gap-2">
                {!d.verifiedAt && <Button size="sm" variant="outline" onClick={() => act(() => apiFetch(`/brand-domains/${d.id}/verify`, { method: "POST" }))}><ShieldCheck /> Xác minh</Button>}
                <Button size="sm" variant="ghost" onClick={() => confirm(`Xoá tên miền ${d.hostname}?`) && act(() => apiFetch(`/brand-domains/${d.id}`, { method: "DELETE" }))}><Trash2 /> Xoá</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {manage &&
        (adding ? (
          <form
            className="mt-3 space-y-2 rounded-xl bg-surface p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act(async () => {
                await apiFetch(`/brands/${brandId}/domains`, { body: { hostname: f.get("hostname"), isPrimary: f.get("isPrimary") === "on", redirectToPrimary: f.get("redirect") === "on" } });
                setAdding(false);
              });
            }}
          >
            <input name="hostname" required placeholder="warranty.origin.vn" className="field" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" className="accent-navy-900" /> Tên miền chính (dùng cho QR của lô mới)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="redirect" className="accent-navy-900" /> Chuyển hướng về tên miền chính</label>
            <div className="flex gap-2"><Button size="sm" type="submit">Thêm</Button><Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Huỷ</Button></div>
          </form>
        ) : (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(true)}><Plus /> Thêm tên miền</Button>
        ))}
    </div>
  );
}
