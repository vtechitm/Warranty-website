"use client";

import { useRef, useState } from "react";
import { ExternalLink, ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/field";
import { apiFetch, ApiError } from "@/lib/api-client";
import { LANDING_LIMITS, type LandingContent } from "@/server/landing-schema";

type Img = string | null;

/**
 * Brand page content form. Field labels, limits and image sizes match the media brief
 * (docs/BRIEF-MEDIA-TRANG-THUONG-HIEU.md) section by section.
 */
export function LandingEditor({ brandId, slug, initial }: { brandId: string; slug: string; initial: LandingContent }) {
  const [c, setC] = useState<LandingContent>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string; details?: string[] } | null>(null);

  const patch = <K extends keyof LandingContent>(k: K, v: LandingContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const patchObj = <K extends "seo" | "hero" | "story" | "origin" | "warranty" | "contact">(k: K, v: Partial<LandingContent[K]>) =>
    setC((p) => ({ ...p, [k]: { ...p[k], ...v } }));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const saved = await apiFetch<LandingContent>(`/brands/${brandId}/landing`, { method: "PUT", body: c });
      setC(saved);
      setMsg({ tone: "green", text: "Đã lưu. Trang thương hiệu đã được cập nhật." });
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as { path: string; message: string }[]).map((d) => `${labelOf(d.path)}: ${d.message}`) : undefined;
      setMsg({ tone: "red", text: (e as Error).message, details });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <Section n={1} title="Banner đầu trang" hint="Ảnh ngang 1920×900 px (máy tính) và ảnh dọc 1080×1350 px (điện thoại). Ô tra cứu mã luôn nằm trên banner.">
        <div className="grid gap-4 md:grid-cols-2">
          <Text label="Dòng nhỏ phía trên tiêu đề" max={40} value={c.hero.eyebrow} onChange={(v) => patchObj("hero", { eyebrow: v })} placeholder="Truy xuất nguồn gốc xuất xứ" />
          <Text label="Tiêu đề lớn" max={90} value={c.hero.title} onChange={(v) => patchObj("hero", { title: v })} placeholder="Răng sứ Origin — tinh hoa công nghệ Mỹ" />
          <Text label="Mô tả ngắn" max={220} value={c.hero.subtitle} onChange={(v) => patchObj("hero", { subtitle: v })} area className="md:col-span-2" />
          <ImageField brandId={brandId} label="Logo (PNG nền trong suốt, cao ≥ 120 px)" value={c.hero.logoUrl} onChange={(v) => patchObj("hero", { logoUrl: v })} compact />
          <div />
          <ImageField brandId={brandId} label="Ảnh banner — máy tính (1920×900)" value={c.hero.imageUrl} onChange={(v) => patchObj("hero", { imageUrl: v })} />
          <ImageField brandId={brandId} label="Ảnh banner — điện thoại (1080×1350)" value={c.hero.mobileImageUrl} onChange={(v) => patchObj("hero", { mobileImageUrl: v })} />
        </div>
      </Section>

      <Section n={2} title="Các bước xác thực" hint={`Tối đa ${LANDING_LIMITS.steps} bước. Để trống sẽ dùng 4 bước mặc định của hệ thống.`}>
        <List items={c.steps} max={LANDING_LIMITS.steps} onChange={(v) => patch("steps", v)} empty={{ title: "", body: null }} addLabel="Thêm bước"
          render={(s, set) => (
            <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
              <Text label="Tên bước" max={60} value={s.title} onChange={(v) => set({ ...s, title: v ?? "" })} />
              <Text label="Mô tả" max={200} value={s.body} onChange={(v) => set({ ...s, body: v })} />
            </div>
          )} />
      </Section>

      <Section n={3} title="Câu chuyện thương hiệu" hint="Ảnh 1600×1200 px (tỉ lệ 4:3). Xuống dòng để tách đoạn.">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Text label="Tiêu đề" max={90} value={c.story.title} onChange={(v) => patchObj("story", { title: v })} placeholder="Mỗi chiếc răng — một cuộc đời" />
            <Text label="Nội dung" max={1500} value={c.story.body} onChange={(v) => patchObj("story", { body: v })} area rows={7} />
          </div>
          <ImageField brandId={brandId} label="Ảnh minh hoạ (1600×1200)" value={c.story.imageUrl} onChange={(v) => patchObj("story", { imageUrl: v })} />
        </div>
      </Section>

      <Section n={4} title="Nguồn gốc xuất xứ & chứng nhận" hint="Nhà sản xuất, nhà máy, tiêu chuẩn. Số liệu nổi bật tối đa 4; logo chứng nhận PNG nền trong suốt.">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Text label="Tiêu đề" max={90} value={c.origin.title} onChange={(v) => patchObj("origin", { title: v })} placeholder="Sản xuất & kiểm định tại Hoa Kỳ" />
            <Text label="Nội dung" max={1500} value={c.origin.body} onChange={(v) => patchObj("origin", { body: v })} area rows={6} />
          </div>
          <ImageField brandId={brandId} label="Ảnh nhà máy / sản xuất (1600×1200)" value={c.origin.imageUrl} onChange={(v) => patchObj("origin", { imageUrl: v })} />
        </div>
        <SubTitle>Số liệu nổi bật</SubTitle>
        <List items={c.origin.highlights} max={LANDING_LIMITS.highlights} onChange={(v) => patchObj("origin", { highlights: v })} empty={{ value: "", label: "" }} addLabel="Thêm số liệu"
          render={(h, set) => (
            <div className="grid gap-3 md:grid-cols-[1fr_3fr]">
              <Text label="Con số" max={12} value={h.value} onChange={(v) => set({ ...h, value: v ?? "" })} placeholder="25+" />
              <Text label="Ý nghĩa" max={60} value={h.label} onChange={(v) => set({ ...h, label: v ?? "" })} placeholder="năm kinh nghiệm vật liệu nha khoa" />
            </div>
          )} />
        <SubTitle>Chứng nhận / tiêu chuẩn</SubTitle>
        <List items={c.origin.certificates} max={LANDING_LIMITS.certificates} onChange={(v) => patchObj("origin", { certificates: v })} empty={{ name: "", imageUrl: null }} addLabel="Thêm chứng nhận"
          render={(cert, set) => (
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <Text label="Tên chứng nhận" max={60} value={cert.name} onChange={(v) => set({ ...cert, name: v ?? "" })} placeholder="ISO 13485:2016" />
              <ImageField brandId={brandId} label="Logo (PNG nền trong, 400×200)" value={cert.imageUrl} onChange={(v) => set({ ...cert, imageUrl: v })} compact />
            </div>
          )} />
      </Section>

      <Section n={5} title="Dòng sản phẩm" hint={`Tối đa ${LANDING_LIMITS.products} sản phẩm. Ảnh vuông 1200×1200 px, sản phẩm nằm giữa, nền trong suốt hoặc nền sáng.`}>
        <List items={c.products} max={LANDING_LIMITS.products} onChange={(v) => patch("products", v)} empty={{ name: "", tagline: null, description: null, imageUrl: null }} addLabel="Thêm sản phẩm"
          render={(p, set) => (
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Text label="Tên sản phẩm" max={60} value={p.name} onChange={(v) => set({ ...p, name: v ?? "" })} placeholder="Origin Beyond Plus" />
                  <Text label="Dòng phụ" max={80} value={p.tagline} onChange={(v) => set({ ...p, tagline: v })} placeholder="Zirconia đa lớp thẩm mỹ" />
                </div>
                <Text label="Mô tả" max={300} value={p.description} onChange={(v) => set({ ...p, description: v })} area />
              </div>
              <ImageField brandId={brandId} label="Ảnh sản phẩm (1200×1200)" value={p.imageUrl} onChange={(v) => set({ ...p, imageUrl: v })} />
            </div>
          )} />
      </Section>

      <Section n={6} title="Thông tin bảo hành & chăm sóc" hint="Hệ thống luôn ghi rõ: thời hạn bảo hành do labo chế tác cung cấp. Phần này là thông tin chung của thương hiệu.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <Text label="Tiêu đề" max={90} value={c.warranty.title} onChange={(v) => patchObj("warranty", { title: v })} placeholder="Thông tin bảo hành" />
            <Text label="Nội dung (điều kiện, quy trình, lưu ý…)" max={3000} value={c.warranty.body} onChange={(v) => patchObj("warranty", { body: v })} area rows={9} />
          </div>
          <div>
            <SubTitle>Hướng dẫn chăm sóc (mỗi dòng một ý)</SubTitle>
            <List items={c.care} max={LANDING_LIMITS.care} onChange={(v) => patch("care", v)} empty="" addLabel="Thêm ý"
              render={(t, set) => <Text label="" max={200} value={t} onChange={(v) => set(v ?? "")} />} />
          </div>
        </div>
      </Section>

      <Section n={7} title="Cảm nhận khách hàng" hint={`Tối đa ${LANDING_LIMITS.testimonials}. Ảnh đại diện vuông 400×400 px — chỉ dùng khi có sự đồng ý của khách hàng.`}>
        <List items={c.testimonials} max={LANDING_LIMITS.testimonials} onChange={(v) => patch("testimonials", v)} empty={{ quote: "", name: "", meta: null, avatarUrl: null }} addLabel="Thêm cảm nhận"
          render={(t, set) => (
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <div className="space-y-3">
                <Text label="Lời nhận xét" max={300} value={t.quote} onChange={(v) => set({ ...t, quote: v ?? "" })} area />
                <div className="grid gap-3 md:grid-cols-2">
                  <Text label="Tên" max={60} value={t.name} onChange={(v) => set({ ...t, name: v ?? "" })} placeholder="Chị Mai L." />
                  <Text label="Nghề nghiệp / nơi ở" max={60} value={t.meta} onChange={(v) => set({ ...t, meta: v })} placeholder="Hoàn Kiếm, Hà Nội" />
                </div>
              </div>
              <ImageField brandId={brandId} label="Ảnh đại diện (400×400)" value={t.avatarUrl} onChange={(v) => set({ ...t, avatarUrl: v })} compact />
            </div>
          )} />
      </Section>

      <Section n={8} title="Đối tác" hint={`Tối đa ${LANDING_LIMITS.partners}. Logo PNG nền trong suốt, 400×200 px.`}>
        <List items={c.partners} max={LANDING_LIMITS.partners} onChange={(v) => patch("partners", v)} empty={{ name: "", logoUrl: null, url: null }} addLabel="Thêm đối tác"
          render={(p, set) => (
            <div className="grid gap-3 md:grid-cols-3">
              <Text label="Tên" max={60} value={p.name} onChange={(v) => set({ ...p, name: v ?? "" })} />
              <Text label="Website (https://…)" max={500} value={p.url} onChange={(v) => set({ ...p, url: v })} />
              <ImageField brandId={brandId} label="Logo (400×200)" value={p.logoUrl} onChange={(v) => set({ ...p, logoUrl: v })} compact />
            </div>
          )} />
      </Section>

      <Section n={9} title="Hỏi đáp" hint={`Tối đa ${LANDING_LIMITS.faq} câu.`}>
        <List items={c.faq} max={LANDING_LIMITS.faq} onChange={(v) => patch("faq", v)} empty={{ q: "", a: "" }} addLabel="Thêm câu hỏi"
          render={(f, set) => (
            <div className="space-y-3">
              <Text label="Câu hỏi" max={150} value={f.q} onChange={(v) => set({ ...f, q: v ?? "" })} />
              <Text label="Trả lời" max={1000} value={f.a} onChange={(v) => set({ ...f, a: v ?? "" })} area />
            </div>
          )} />
      </Section>

      <Section n={10} title="Liên hệ" hint="Hotline, email, website lấy từ thông tin thương hiệu (nút Sửa ở trang Thương hiệu).">
        <div className="grid gap-4 md:grid-cols-2">
          <Text label="Tiêu đề kêu gọi" max={90} value={c.contact.ctaTitle} onChange={(v) => patchObj("contact", { ctaTitle: v })} placeholder="Bạn cần tư vấn thêm về răng sứ?" />
          <Text label="Mô tả" max={200} value={c.contact.ctaBody} onChange={(v) => patchObj("contact", { ctaBody: v })} />
          <Text label="Địa chỉ" max={200} value={c.contact.address} onChange={(v) => patchObj("contact", { address: v })} />
          <Text label="Link Zalo OA (https://zalo.me/…)" max={500} value={c.contact.zaloUrl} onChange={(v) => patchObj("contact", { zaloUrl: v })} />
          <Text label="Link Facebook (https://…)" max={500} value={c.contact.facebookUrl} onChange={(v) => patchObj("contact", { facebookUrl: v })} />
        </div>
      </Section>

      <Section n={11} title="SEO & chia sẻ" hint="Hiển thị trên Google và khi chia sẻ link qua Zalo/Facebook. Ảnh chia sẻ 1200×630 px.">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Text label="Tiêu đề trang" max={70} value={c.seo.title} onChange={(v) => patchObj("seo", { title: v })} />
            <Text label="Mô tả" max={160} value={c.seo.description} onChange={(v) => patchObj("seo", { description: v })} area />
          </div>
          <ImageField brandId={brandId} label="Ảnh chia sẻ (1200×630)" value={c.seo.ogImageUrl} onChange={(v) => patchObj("seo", { ogImageUrl: v })} />
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            {msg && (
              <div className={msg.tone === "green" ? "text-sm font-medium text-emerald-700" : "text-sm text-red-700"}>
                {msg.text}
                {msg.details && <ul className="mt-1 list-disc pl-5 text-xs">{msg.details.slice(0, 5).map((d) => <li key={d}>{d}</li>)}</ul>}
              </div>
            )}
          </div>
          <a href={`/b/${slug}`} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink /> Xem trang</Button></a>
          <Button onClick={save} loading={saving}><Save /> Lưu nội dung</Button>
        </div>
      </div>
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  seo: "SEO", hero: "Banner", story: "Câu chuyện", origin: "Nguồn gốc", products: "Sản phẩm", warranty: "Bảo hành", steps: "Các bước",
  care: "Chăm sóc", testimonials: "Cảm nhận", partners: "Đối tác", faq: "Hỏi đáp", contact: "Liên hệ", highlights: "Số liệu", certificates: "Chứng nhận",
};
function labelOf(path: string) {
  return path.split(".").map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : SECTION_LABELS[p] ?? p)).join(" › ");
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">{n}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-5 text-sm font-semibold">{children}</div>;
}

function Text({ label, max, value, onChange, area, rows = 3, placeholder, className }: {
  label: string; max: number; value: string | null; onChange: (v: string | null) => void; area?: boolean; rows?: number; placeholder?: string; className?: string;
}) {
  const len = value?.length ?? 0;
  const counter = <span className={len > max ? "text-red-600" : ""}>{len}/{max}</span>;
  const props = { value: value ?? "", placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value || null) };
  return (
    <div className={className}>
      <Field label={label || " "} hint={undefined}>
        {area ? <Textarea {...props} rows={rows} className="min-h-0" /> : <Input {...props} />}
      </Field>
      <div className="mt-1 text-right text-[11px] text-muted">{counter}</div>
    </div>
  );
}

function List<T>({ items, max, onChange, empty, addLabel, render }: {
  items: T[]; max: number; onChange: (v: T[]) => void; empty: T; addLabel: string; render: (item: T, set: (v: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="relative rounded-2xl border border-line bg-surface/50 p-4 pr-12">
          <span className="absolute left-3 top-2 text-[10px] font-semibold text-muted">#{i + 1}</span>
          <button type="button" aria-label="Xoá mục" onClick={() => onChange(items.filter((_, j) => j !== i))} className="absolute right-3 top-3 rounded-lg p-1.5 text-red-600 hover:bg-red-50">
            <Trash2 className="size-4" />
          </button>
          <div className="pt-2">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
        </div>
      ))}
      {items.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, structuredClone(empty)])}><Plus /> {addLabel} ({items.length}/{max})</Button>
      )}
    </div>
  );
}

function ImageField({ brandId, label, value, onChange, compact }: { brandId: string; label: string; value: Img; onChange: (v: Img) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch<{ url: string }>(`/brands/${brandId}/assets`, { body: fd });
      onChange(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div>
      <span className="label">{label}</span>
      <div className={`relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface ${compact ? "h-24" : "aspect-[4/3]"}`}>
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="size-full object-contain" />
            <button type="button" aria-label="Bỏ ảnh" onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"><X className="size-3.5" /></button>
          </>
        ) : (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex flex-col items-center gap-1 text-xs text-muted">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-6" />}
            {busy ? "Đang tải…" : "Tải ảnh lên (JPG/PNG/WebP ≤ 5 MB)"}
          </button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {value && <button type="button" onClick={() => input.current?.click()} className="mt-1 text-xs text-navy-700 underline">Đổi ảnh</button>}
      {error && <Alert tone="red">{error}</Alert>}
    </div>
  );
}
