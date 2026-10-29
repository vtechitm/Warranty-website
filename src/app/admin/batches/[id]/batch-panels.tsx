"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, FolderArchive, Loader2, Package, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export function BatchProgress({ batchId, initial, quantity }: { batchId: string; initial: number; quantity: number }) {
  const router = useRouter();
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const t = setInterval(async () => {
      const b = await apiFetch<{ status: string; generatedCount: number }>(`/batches/${batchId}`).catch(() => null);
      if (!b) return;
      setCount(b.generatedCount);
      if (b.status === "COMPLETED" || b.status === "FAILED") {
        clearInterval(t);
        router.refresh();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [batchId, router]);
  return (
    <div className="card mb-6 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="size-4 animate-spin" /> Đang sinh mã… {count.toLocaleString("vi-VN")}/{quantity.toLocaleString("vi-VN")}</div>
      <div className="mt-3 h-2 rounded-full bg-surface"><div className="h-full rounded-full bg-navy-900 transition-all" style={{ width: `${(count / quantity) * 100}%` }} /></div>
    </div>
  );
}

export function ExportPanel({ batchId, total, templates }: { batchId: string; total: number; templates: { value: string; label: string }[] }) {
  const [template, setTemplate] = useState(templates[0]?.value ?? "a4-3x8");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(total, 2000));
  const [cut, setCut] = useState(true);
  const range = `serialFrom=${from}&serialTo=${to}`;
  return (
    <section className="card p-5">
      <h2 className="font-semibold">Xuất dữ liệu & in nhãn</h2>
      <div className="mt-4 rounded-2xl border border-gold-500/40 bg-gold-300/10 p-4">
        <div className="text-sm font-semibold">Gói dữ liệu cho nhà in thẻ</div>
        <p className="mt-1 text-xs text-muted">
          Một tệp ZIP gồm: Excel có ảnh QR từng mã, tệp CSV để trộn in hàng loạt (InDesign Data Merge, CorelDRAW, BarTender), ảnh QR PNG + SVG và hướng dẫn in. Theo khoảng serial bên dưới (tối đa 10.000 mã/gói).
        </p>
        <a href={`/api/v1/batches/${batchId}/print-package?${range}`} className="mt-3 block">
          <Button variant="gold" className="w-full"><Package /> Tải gói dữ liệu in ({Math.max(0, to - from + 1).toLocaleString("vi-VN")} mã)</Button>
        </a>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <a href={`/api/v1/batches/${batchId}/export`}><Button variant="outline" className="w-full"><FileSpreadsheet /> Excel + ảnh QR</Button></a>
        <a href={`/api/v1/batches/${batchId}/qr-zip?format=png&${range}`}><Button variant="outline" className="w-full"><FolderArchive /> ZIP PNG</Button></a>
        <a href={`/api/v1/batches/${batchId}/qr-zip?format=svg&${range}`}><Button variant="outline" className="w-full"><FolderArchive /> ZIP SVG</Button></a>
      </div>
      <div className="mt-5 space-y-4 rounded-2xl bg-surface p-4">
        <div className="text-sm font-semibold">In nhãn QR (PDF)</div>
        <Field label="Mẫu nhãn">
          <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {templates.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serial từ"><Input type="number" min={1} max={total} value={from} onChange={(e) => setFrom(Number(e.target.value))} /></Field>
          <Field label="Serial đến" hint="Tối đa 2.000 nhãn/tệp"><Input type="number" min={1} max={total} value={to} onChange={(e) => setTo(Number(e.target.value))} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} className="size-4 accent-navy-900" /> Hiển thị đường cắt</label>
        <a href={`/api/v1/batches/${batchId}/labels?template=${template}&${range}&cutLines=${cut ? 1 : 0}`} target="_blank">
          <Button className="w-full"><FileText /> Tạo PDF nhãn in</Button>
        </a>
        <p className="text-xs text-muted">QR được vẽ dạng vector, kích thước tối thiểu 24 mm, mức sửa lỗi Q — đảm bảo quét tốt khi in.</p>
      </div>
    </section>
  );
}
