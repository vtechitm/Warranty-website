"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

type Domain = { id: string; hostname: string; isPrimary: boolean; verifiedAt: string | null; verificationToken: string; redirectToPrimary: boolean };

export function DomainManager({ brandId, domains, manage, serverIp }: { brandId: string; domains: Domain[]; manage: boolean; serverIp: string | null }) {
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
            {!d.verifiedAt && <DnsRecords hostname={d.hostname} token={d.verificationToken} serverIp={serverIp} />}
            {manage && (
              <div className="mt-2 flex gap-2">
                {!d.verifiedAt && <Button size="sm" variant="outline" onClick={() => act(() => apiFetch(`/brand-domains/${d.id}/verify`, { method: "POST" }))}><ShieldCheck /> Xác minh</Button>}
                {d.verifiedAt && !d.isPrimary && <Button size="sm" variant="outline" onClick={() => act(() => apiFetch(`/brand-domains/${d.id}`, { method: "PATCH", body: { isPrimary: true } }))}><Star /> Đặt làm tên miền chính</Button>}
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
            <input name="hostname" required placeholder="baohanh.origindental.vn" className="field" />
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

/** DNS records the domain owner adds at their registrar / Cloudflare. */
function DnsRecords({ hostname, token, serverIp }: { hostname: string; token: string; serverIp: string | null }) {
  const cell = "mono break-all rounded bg-surface px-1.5 py-0.5";
  return (
    <div className="mt-2 rounded-lg border border-line p-2 text-xs">
      <div className="mb-1 font-semibold">Thêm 2 bản ghi DNS tại nơi quản lý tên miền, rồi bấm Xác minh:</div>
      <table className="w-full">
        <thead className="text-left text-muted"><tr><th className="py-1 pr-2">Loại</th><th className="pr-2">Tên (Host)</th><th>Giá trị</th></tr></thead>
        <tbody>
          <tr><td className="py-1 pr-2 font-semibold">A</td><td className="pr-2"><span className={cell}>{hostname}</span></td><td><span className={cell}>{serverIp ?? "IP máy chủ (hỏi Vtech)"}</span></td></tr>
          <tr><td className="py-1 pr-2 font-semibold">TXT</td><td className="pr-2"><span className={cell}>_vtech-verify.{hostname}</span></td><td><span className={cell}>{token}</span></td></tr>
        </tbody>
      </table>
      <div className="mt-1 text-muted">Cloudflare: để “DNS only” (đám mây xám). DNS có thể mất từ vài phút đến vài giờ để cập nhật. HTTPS được cấp tự động sau khi bản ghi A trỏ đúng.</div>
    </div>
  );
}
