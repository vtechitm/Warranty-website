"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Download, ExternalLink, QrCode, ShieldCheck, Stethoscope, User, X } from "lucide-react";
import { ToothChart, QUICK_SELECTIONS } from "@/components/tooth-chart";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { fmtDate, fmtDuration, lastCoveredDay, START_RULE_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";

type Checked = {
  code: string;
  url: string;
  brand: { id: string; name: string; primaryColor: string; secondaryColor: string };
  product: { id: string; name: string; sku: string; materialType: string | null };
  policy: { version: number; durationMonths: number; startRule: string; conditions: string | null; exclusions: string | null };
};

type Clinic = { id: string; name: string; address: string | null; phone: string | null };

type Draft = {
  patientName: string;
  patientPhone: string;
  birthYear: string;
  externalRef: string;
  clinicId: string | null;
  clinicName: string;
  dentistName: string;
  clinicPhone: string;
  restorationType: string;
  teeth: number[];
  shade: string;
  completionDate: string;
  installationDate: string;
  installationUnknown: boolean;
  lotNumber: string;
  notes: string;
  consent: boolean;
};

type Result = {
  code: string;
  url: string;
  accessCode: string;
  unitCount: number;
  teeth: number[];
  installationStatus: string;
  warrantyEndDate: string | null;
  durationMonths: number;
};

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const RECENT_CLINICS_KEY = "vt-recent-clinics";

function emptyDraft(defaultType: string): Draft {
  return {
    patientName: "", patientPhone: "", birthYear: "", externalRef: "",
    clinicId: null, clinicName: "", dentistName: "", clinicPhone: "",
    restorationType: defaultType, teeth: [], shade: "",
    completionDate: today(), installationDate: "", installationUnknown: false,
    lotNumber: "", notes: "", consent: false,
  };
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ActivationForm({ checked, restorationTypes }: { checked: Checked; restorationTypes: string[] }) {
  const draftKey = `vt-draft-${checked.code}`;
  const [d, setD] = useState<Draft>(() => emptyDraft(restorationTypes[0]));
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [recentClinics, setRecentClinics] = useState<{ id: string | null; name: string; dentistName: string }[]>([]);
  const loaded = useRef(false);

  // Restore autosaved draft (per code) and recent clinics.
  useEffect(() => {
    const saved = readStorage<Draft | null>(draftKey, null);
    if (saved) {
      setD({ ...emptyDraft(restorationTypes[0]), ...saved, consent: false });
      setRestored(true);
    }
    setRecentClinics(readStorage(RECENT_CLINICS_KEY, []));
    loaded.current = true;
  }, [draftKey, restorationTypes]);

  useEffect(() => {
    if (!loaded.current || result) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(d));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [d, draftKey, result]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const toggleTooth = (n: number) => setD((p) => ({ ...p, teeth: p.teeth.includes(n) ? p.teeth.filter((t) => t !== n) : [...p.teeth, n].sort((a, b) => a - b) }));

  const needsInstallDate = checked.policy.startRule === "INSTALLATION_DATE";
  const pending = needsInstallDate && (d.installationUnknown || !d.installationDate);
  const ready = d.patientName.trim() && (d.clinicId || d.clinicName.trim()) && d.teeth.length > 0 && d.consent;

  const previewEnd = useMemo(() => {
    const start = checked.policy.startRule === "INSTALLATION_DATE" ? (d.installationUnknown ? "" : d.installationDate) : checked.policy.startRule === "COMPLETION_DATE" ? d.completionDate : today();
    if (!start) return null;
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + checked.policy.durationMonths, 1));
    const last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
    e.setUTCDate(Math.min(s.getUTCDate(), last));
    return lastCoveredDay(e);
  }, [checked.policy, d.installationDate, d.installationUnknown, d.completionDate]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await apiFetch<Result>(`/warranties/${encodeURIComponent(checked.code)}/activate`, {
        body: {
          patient: { fullName: d.patientName, phone: d.patientPhone || null, birthYear: d.birthYear ? Number(d.birthYear) : null, externalRef: d.externalRef || null, consent: d.consent },
          clinic: { clinicId: d.clinicId, name: d.clinicId ? null : d.clinicName, dentistName: d.dentistName || null, phone: d.clinicPhone || null },
          restoration: {
            restorationType: d.restorationType,
            teeth: d.teeth.map((toothNumber) => ({ toothNumber, shade: d.shade || null })),
            completionDate: d.completionDate || null,
            installationDate: d.installationUnknown ? null : d.installationDate || null,
            materialLotNumber: d.lotNumber || null,
            notes: d.notes || null,
          },
        },
      });
      try {
        localStorage.removeItem(draftKey);
        const recent = [{ id: d.clinicId, name: d.clinicName, dentistName: d.dentistName }, ...recentClinics.filter((c) => c.name !== d.clinicName)].slice(0, 5);
        localStorage.setItem(RECENT_CLINICS_KEY, JSON.stringify(recent));
      } catch {}
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <Success result={result} productName={checked.product.name} />;

  return (
    <div className="mx-auto max-w-2xl pb-28">
      {/* Product (auto-detected from the code, not editable) */}
      <section className="overflow-hidden rounded-3xl text-white" style={{ background: `linear-gradient(135deg, ${checked.brand.primaryColor}, #050f1f)` }}>
        <div className="p-5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: checked.brand.secondaryColor }}>
            <span>{checked.brand.name}</span>
            <span className="flex items-center gap-1 text-white/60 normal-case tracking-normal"><QrCode className="size-3.5" /> Tự động nhận diện</span>
          </div>
          <div className="mt-2 text-xl font-bold">{checked.product.name}</div>
          <div className="mono mt-1 text-lg" style={{ color: checked.brand.secondaryColor }}>{checked.code}</div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70">
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Bảo hành {fmtDuration(checked.policy.durationMonths)}</span>
            <span>{START_RULE_LABEL[checked.policy.startRule]}</span>
          </div>
        </div>
      </section>

      {restored && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-800 ring-1 ring-blue-200">
          Đã khôi phục bản nháp đang nhập dở cho mã này.
          <button className="font-semibold underline" onClick={() => { setD(emptyDraft(restorationTypes[0])); setRestored(false); localStorage.removeItem(draftKey); }}>Xoá nháp</button>
        </div>
      )}

      <Step n={1} title="Bệnh nhân" icon={<User />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ tên bệnh nhân *" className="sm:col-span-2">
            <Input value={d.patientName} onChange={(e) => set("patientName", e.target.value)} placeholder="Nguyễn Văn A" autoComplete="off" />
          </Field>
          <Field label="Số điện thoại" hint="Dùng để bệnh nhân tự xác thực khi xem hồ sơ">
            <Input value={d.patientPhone} onChange={(e) => set("patientPhone", e.target.value)} inputMode="tel" placeholder="09xx xxx xxx" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Năm sinh">
              <Input value={d.birthYear} onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="1985" />
            </Field>
            <Field label="Mã BN / phiếu">
              <Input value={d.externalRef} onChange={(e) => set("externalRef", e.target.value)} placeholder="Tuỳ chọn" />
            </Field>
          </div>
        </div>
      </Step>

      <Step n={2} title="Phòng khám & bác sĩ" icon={<Building2 />}>
        <ClinicPicker
          value={{ id: d.clinicId, name: d.clinicName }}
          onChange={(c) => setD((p) => ({ ...p, clinicId: c.id, clinicName: c.name, clinicPhone: c.phone ?? p.clinicPhone }))}
          recent={recentClinics}
          onPickRecent={(c) => setD((p) => ({ ...p, clinicId: c.id, clinicName: c.name, dentistName: c.dentistName || p.dentistName }))}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Bác sĩ">
            <Input value={d.dentistName} onChange={(e) => set("dentistName", e.target.value)} placeholder="BS. Trần B" />
          </Field>
          <Field label="SĐT phòng khám">
            <Input value={d.clinicPhone} onChange={(e) => set("clinicPhone", e.target.value)} inputMode="tel" />
          </Field>
        </div>
      </Step>

      <Step n={3} title="Phục hình" icon={<Stethoscope />}>
        <div className="flex flex-wrap gap-2">
          {restorationTypes.map((t) => (
            <button key={t} type="button" onClick={() => set("restorationType", t)} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", d.restorationType === t ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink")}>
              {t}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-line bg-surface/60 p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold">Chọn vị trí răng (FDI)</span>
            <span className="rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-white">{d.teeth.length} đơn vị</span>
          </div>
          <ToothChart selected={d.teeth} onToggle={toggleTooth} accent={checked.brand.primaryColor} />
          <div className="mt-3 flex flex-wrap gap-1.5 px-1">
            {QUICK_SELECTIONS.map((q) => (
              <button key={q.label} type="button" onClick={() => set("teeth", [...new Set([...d.teeth, ...q.teeth])].sort((a, b) => a - b))} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-line hover:ring-navy-700">
                + {q.label}
              </button>
            ))}
            {d.teeth.length > 0 && (
              <button type="button" onClick={() => set("teeth", [])} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                <X className="size-3" /> Bỏ chọn
              </button>
            )}
          </div>
          {d.teeth.length > 0 && <div className="mt-2 px-1 text-xs text-muted">Đã chọn: {d.teeth.join(", ")}</div>}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Ngày hoàn thành phục hình">
            <Input type="date" value={d.completionDate} max={today()} onChange={(e) => set("completionDate", e.target.value)} />
          </Field>
          <div>
            <Field label={needsInstallDate ? "Ngày lắp cho bệnh nhân" : "Ngày lắp (nếu biết)"}>
              <Input type="date" value={d.installationUnknown ? "" : d.installationDate} disabled={d.installationUnknown} onChange={(e) => set("installationDate", e.target.value)} />
            </Field>
            <label className="mt-2 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={d.installationUnknown} onChange={(e) => set("installationUnknown", e.target.checked)} className="size-4 accent-navy-900" />
              Chưa biết ngày lắp — xác nhận sau
            </label>
          </div>
          <Field label="Số lô vật liệu" hint="Tuỳ chọn — phục vụ truy xuất nguồn gốc">
            <Input value={d.lotNumber} onChange={(e) => set("lotNumber", e.target.value)} placeholder="LOT-…" />
          </Field>
          <Field label="Màu răng (shade)">
            <Input value={d.shade} onChange={(e) => set("shade", e.target.value)} placeholder="A2" />
          </Field>
          <Field label="Ghi chú" className="sm:col-span-2">
            <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="min-h-0" />
          </Field>
        </div>
      </Step>

      <Step n={4} title="Xác nhận chính sách" icon={<ShieldCheck />}>
        <div className="rounded-2xl bg-surface p-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-muted">Thời hạn</div><div className="font-semibold">{fmtDuration(checked.policy.durationMonths)}</div></div>
            <div><div className="text-xs text-muted">Hiệu lực đến hết</div><div className="font-semibold">{pending ? "Chờ xác nhận ngày lắp" : previewEnd ? fmtDate(previewEnd) : "—"}</div></div>
          </div>
          {checked.policy.conditions && <p className="mt-3 whitespace-pre-line text-muted">{checked.policy.conditions}</p>}
          <div className="mt-2 text-xs text-muted">Chính sách phiên bản {checked.policy.version} sẽ được lưu kèm chứng nhận.</div>
        </div>
        {pending && <div className="mt-3"><Alert tone="amber">Bảo hành sẽ ở trạng thái <b>chờ xác nhận ngày lắp</b>. Bạn có thể cập nhật ngày lắp sau trong mục Lịch sử.</Alert></div>}
        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
          <input type="checkbox" checked={d.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy-900" />
          <span>
            Tôi xác nhận bệnh nhân đã được thông báo và đồng ý việc thu thập, xử lý dữ liệu cá nhân (họ tên, số điện thoại, thông tin phục hình) cho mục đích bảo hành theo Nghị định 13/2023/NĐ-CP.
          </span>
        </label>
      </Step>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="hidden min-w-0 flex-1 text-sm sm:block">
            <div className="truncate font-semibold">{d.patientName || "Chưa nhập bệnh nhân"}</div>
            <div className="text-xs text-muted">{d.teeth.length} răng · {d.clinicName || "chưa chọn phòng khám"}</div>
          </div>
          <Button size="xl" className="w-full sm:w-auto sm:min-w-56" disabled={!ready} loading={submitting} onClick={submit}>
            <CheckCircle2 /> KÍCH HOẠT
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, icon, children }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-4 flex items-center gap-3 font-bold">
        <span className="flex size-7 items-center justify-center rounded-full bg-navy-900 text-xs text-white">{n}</span>
        <span className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-gold-600">{icon} {title}</span>
      </h2>
      {children}
    </section>
  );
}

function ClinicPicker({
  value,
  onChange,
  recent,
  onPickRecent,
}: {
  value: { id: string | null; name: string };
  onChange: (c: { id: string | null; name: string; phone?: string | null }) => void;
  recent: { id: string | null; name: string; dentistName: string }[];
  onPickRecent: (c: { id: string | null; name: string; dentistName: string }) => void;
}) {
  const [results, setResults] = useState<Clinic[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      apiFetch<Clinic[]>(`/clinics?q=${encodeURIComponent(value.name)}`).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [value.name, open]);
  return (
    <div>
      <Field label="Phòng khám *" hint={value.id ? "Đã chọn từ danh sách" : value.name ? "Phòng khám mới sẽ được lưu vào danh sách của labo" : undefined}>
        <div className="relative">
          <Input
            value={value.name}
            onChange={(e) => onChange({ id: null, name: e.target.value })}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Tìm hoặc nhập tên phòng khám"
            autoComplete="off"
          />
          {open && results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onMouseDown={() => { onChange({ id: c.id, name: c.name, phone: c.phone }); setOpen(false); }} className="w-full px-3.5 py-2 text-left text-sm hover:bg-surface">
                    <div className="font-medium">{c.name}</div>
                    {c.address && <div className="text-xs text-muted">{c.address}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      {recent.length > 0 && !value.name && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-xs text-muted">Gần đây:</span>
          {recent.map((c) => (
            <button key={c.name} type="button" onClick={() => onPickRecent(c)} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium ring-1 ring-line">{c.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Success({ result, productName }: { result: Result; productName: string }) {
  const lastDay = lastCoveredDay(result.warrantyEndDate);
  return (
    <div className="mx-auto max-w-lg">
      <div className="card overflow-hidden text-center">
        <div className="bg-emerald-600 px-6 py-8 text-white">
          <CheckCircle2 className="mx-auto size-14" />
          <h1 className="mt-3 text-xl font-bold">ĐÃ KÍCH HOẠT BẢO HÀNH THÀNH CÔNG</h1>
        </div>
        <div className="space-y-5 p-6">
          <div>
            <div className="mono text-2xl font-bold text-navy-900">{result.code}</div>
            <div className="mt-1 text-sm text-muted">{productName} · {result.unitCount} răng ({result.teeth.join(", ")})</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/v1/warranties/${encodeURIComponent(result.code)}/qr?size=480`} alt={`QR ${result.code}`} className="mx-auto size-44 rounded-xl ring-1 ring-line" />
          <div className="grid grid-cols-2 gap-3 text-left text-sm">
            <div className="rounded-xl bg-surface p-3"><div className="text-xs text-muted">Thời hạn</div><div className="font-semibold">{fmtDuration(result.durationMonths)}</div></div>
            <div className="rounded-xl bg-surface p-3"><div className="text-xs text-muted">Hiệu lực đến hết</div><div className="font-semibold">{result.installationStatus === "PENDING_CONFIRMATION" ? "Chờ ngày lắp" : fmtDate(lastDay)}</div></div>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-gold-500 bg-gold-300/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gold-600">Mã xác thực bệnh nhân</div>
            <div className="mono mt-1 text-3xl font-bold text-navy-900">{result.accessCode}</div>
            <div className="mt-1 text-xs text-muted">Đã in trên chứng nhận PDF. Bệnh nhân dùng mã này để xem hồ sơ & yêu cầu bảo hành.</div>
          </div>
          <div className="grid gap-2">
            <a href={`/api/v1/warranties/${encodeURIComponent(result.code)}/certificate`} target="_blank"><Button size="lg" className="w-full"><Download /> Tải / in chứng nhận PDF</Button></a>
            <a href={`/w/${encodeURIComponent(result.code)}`} target="_blank"><Button size="lg" variant="outline" className="w-full"><ExternalLink /> Xem trang bệnh nhân</Button></a>
            <Link href="/lab/activate?mode=scan"><Button size="lg" variant="gold" className="w-full"><QrCode /> Kích hoạt mã khác</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
