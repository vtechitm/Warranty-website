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

type Mode = "quantity" | "range" | "codes";

export function AssignPanel({ batchId, labs, maxSerial, unassigned }: { batchId: string; labs: { id: string; name: string; code: string }[]; maxSerial: number; unassigned: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("quantity");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <section className="card p-5">
      <h2 className="font-semibold">Cấp mã cho labo</h2>
      <p className="mt-1 text-sm text-muted">Mã chỉ có thể kích hoạt bởi labo được cấp. Mã chưa kích hoạt có thể cấp lại cho labo khác.</p>
      {labs.length === 0 ? (
        <div className="mt-4"><Alert tone="amber">Chưa có labo nào được ủy quyền cho thương hiệu này.</Alert></div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const body: Record<string, unknown> = { laboratoryId: f.get("laboratoryId"), batchId, note: f.get("note") || null };
            if (mode === "quantity") body.quantity = Number(f.get("quantity"));
            if (mode === "range") Object.assign(body, { serialFrom: Number(f.get("serialFrom")), serialTo: Number(f.get("serialTo")) });
            if (mode === "codes") {
              body.codes = String(f.get("codes")).split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
              delete body.batchId;
            }
            setLoading(true);
            setMsg(null);
            try {
              const r = await apiFetch<{ assigned: number }>("/warranties/assign", { body });
              setMsg({ tone: "green", text: `Đã cấp ${r.assigned.toLocaleString("vi-VN")} mã.` });
              router.refresh();
            } catch (err) {
              setMsg({ tone: "red", text: (err as Error).message });
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Labo nhận mã">
            <Select name="laboratoryId" required>
              {labs.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 text-sm">
            {([["quantity", "N mã tiếp theo"], ["range", "Khoảng serial"], ["codes", "Danh sách mã"]] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn("h-9 rounded-lg font-medium", mode === m ? "bg-white shadow-sm" : "text-muted")}>{l}</button>
            ))}
          </div>
          {mode === "quantity" && <Field label="Số lượng" hint={`Còn ${unassigned.toLocaleString("vi-VN")} mã chưa cấp; cấp theo thứ tự in.`}><Input name="quantity" type="number" min={1} max={unassigned} defaultValue={Math.min(100, unassigned)} required /></Field>}
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Serial từ"><Input name="serialFrom" type="number" min={1} max={maxSerial} required /></Field>
              <Field label="Serial đến"><Input name="serialTo" type="number" min={1} max={maxSerial} required /></Field>
            </div>
          )}
          {mode === "codes" && <Field label="Mã bảo hành" hint="Mỗi dòng một mã, hoặc phân cách bằng dấu phẩy"><Textarea name="codes" rows={4} required className="mono" /></Field>}
          <Field label="Ghi chú"><Input name="note" placeholder="VD: Giao thẻ ngày 16/10" /></Field>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Button type="submit" className="w-full" loading={loading}><Send /> Cấp mã</Button>
        </form>
      )}
    </section>
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
