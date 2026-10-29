"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";

type PreviewRow = {
  row: number; labCode: string; sku: string; brandPrefix: string | null; units: string; reference: string | null;
  ok: boolean; error: string | null; laboratoryName: string | null; productName: string | null; balanceAfter: number | null;
};
type Preview = { filename: string; rows: PreviewRow[]; summary: { total: number; valid: number; invalid: number; units: number } };

const MAX_SHOWN = 300;

export function UnitImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function runPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setLoading(true);
    setMsg(null);
    setPreview(null);
    try {
      const p = await apiFetch<Preview>("/units/import/preview", { body: fd });
      setPreview(p);
      setOnlyErrors(p.summary.invalid > 0);
    } catch (err) {
      setMsg({ tone: "red", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setLoading(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ rows: number; units: number }>("/units/import", {
        body: { rows: preview.rows.map(({ row, labCode, sku, brandPrefix, units, reference }) => ({ row, labCode, sku, brandPrefix, units, reference })), note: note || null, filename: preview.filename },
      });
      setMsg({ tone: "green", text: `Đã cấp ${r.units.toLocaleString("vi-VN")} đơn vị răng (${r.rows} dòng).` });
      setPreview(null);
      setFile(null);
    } catch (err) {
      setMsg({ tone: "red", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const shown = preview ? preview.rows.filter((r) => !onlyErrors || !r.ok) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="card h-fit p-5">
        <h2 className="font-semibold">1. Chọn tệp</h2>
        <form className="mt-4 space-y-4" onSubmit={runPreview}>
          <Field label="Tệp .xlsx hoặc .csv" hint="Tối đa 2.000 dòng, 5 MB. Sheet đầu tiên được sử dụng.">
            <span className="field flex cursor-pointer items-center gap-3">
              <span className="shrink-0 rounded-lg bg-surface px-3 py-1 text-sm font-semibold ring-1 ring-line">Chọn tệp…</span>
              <span className={file ? "truncate" : "truncate text-slate-400"}>{file ? file.name : "Chưa chọn tệp"}</span>
              <input
                type="file"
                name="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
            </span>
          </Field>
          <Button type="submit" className="w-full" loading={loading && !preview} disabled={!file}><FileUp /> Kiểm tra & xem trước</Button>
        </form>
        <div className="mt-5 rounded-xl bg-surface p-4 text-xs text-muted">
          <div className="mb-2 font-semibold text-ink">Định dạng</div>
          Dòng tiêu đề (không bắt buộc): <b>Mã labo</b>, <b>Mã phôi</b> (SKU), <b>Số đơn vị</b>, <b>Số hoá đơn</b>; thêm cột <b>Thương hiệu</b> (tiền tố mã, VD OR) nếu một SKU có ở nhiều thương hiệu. Không có tiêu đề: cột A–D theo thứ tự trên.
          <pre className="mono mt-2 rounded-lg bg-white p-2 text-[11px] text-ink">{"Mã labo,Mã phôi,Số đơn vị,Số hoá đơn\nLAB-0001,OBP,200,HD-2026-0158\nLAB-0002,OBP,50,HD-2026-0159"}</pre>
        </div>
      </section>

      <section className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {!preview && !msg && <div className="card p-8 text-center text-sm text-muted">Kết quả kiểm tra sẽ hiển thị ở đây.</div>}
        {preview && (
          <>
            <div className="card p-5">
              <h2 className="font-semibold">2. Xem trước — {preview.filename}</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge tone="gray">{preview.summary.total.toLocaleString("vi-VN")} dòng</Badge>
                <Badge tone="green">{preview.summary.valid.toLocaleString("vi-VN")} hợp lệ · {preview.summary.units.toLocaleString("vi-VN")} đơn vị</Badge>
                {preview.summary.invalid > 0 && <Badge tone="red">{preview.summary.invalid.toLocaleString("vi-VN")} lỗi</Badge>}
              </div>
              {preview.summary.invalid > 0 ? (
                <div className="mt-4">
                  <Alert tone="red"><TriangleAlert className="mr-1 inline size-4" /> Sửa các dòng lỗi trong tệp rồi tải lên lại. Chỉ có thể xác nhận khi toàn bộ tệp hợp lệ.</Alert>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <Field label="Ghi chú chung"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Nhập từ tệp ${preview.filename}`} /></Field>
                  <Button onClick={confirm} loading={loading} className="w-full"><Send /> Xác nhận cấp {preview.summary.units.toLocaleString("vi-VN")} đơn vị răng</Button>
                </div>
              )}
            </div>
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
                <span className="font-semibold">Chi tiết</span>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="size-4 accent-navy-900" /> Chỉ hiện dòng lỗi
                </label>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                    <tr><th className="px-4 py-2">Dòng</th><th className="px-4 py-2">Labo</th><th className="px-4 py-2">Phôi</th><th className="px-4 py-2 text-right">Số đơn vị</th><th className="px-4 py-2">Kết quả</th></tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, MAX_SHOWN).map((r) => (
                      <tr key={r.row} className="border-t border-line">
                        <td className="px-4 py-2 text-muted">{r.row}</td>
                        <td className="px-4 py-2">{r.labCode || "—"}{r.laboratoryName ? <span className="text-muted"> · {r.laboratoryName}</span> : null}</td>
                        <td className="px-4 py-2">{r.sku || "—"}{r.productName ? <span className="text-muted"> · {r.productName}</span> : null}</td>
                        <td className="px-4 py-2 text-right">{r.units}</td>
                        <td className="px-4 py-2">
                          {r.ok ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" /> OK · còn {r.balanceAfter?.toLocaleString("vi-VN")}</span>
                          ) : (
                            <span className="text-red-700">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length > MAX_SHOWN && <p className="px-4 py-3 text-xs text-muted">Hiển thị {MAX_SHOWN} / {shown.length.toLocaleString("vi-VN")} dòng.</p>}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
