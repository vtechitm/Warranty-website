"use client";

import { useEffect, useState } from "react";
import { ImagePlus, LifeBuoy, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

const ACCEPT = "image/jpeg,image/png,image/webp";

export function ClaimForm({ code, maxImages = 6, maxImageMb = 8 }: { code: string; maxImages?: number; maxImageMb?: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (next.length >= maxImages) { setError(`Tối đa ${maxImages} ảnh`); break; }
      if (!ACCEPT.split(",").includes(file.type)) { setError(`“${file.name}” không phải ảnh JPEG, PNG hoặc WebP`); continue; }
      if (file.size > maxImageMb * 1024 * 1024) { setError(`“${file.name}” vượt quá ${maxImageMb} MB`); continue; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos(next);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        Đã gửi yêu cầu bảo hành <b>{done}</b>. Vtech sẽ liên hệ bạn để xem xét. Yêu cầu không được duyệt tự động.
      </div>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 font-semibold text-white/85">
        <LifeBuoy className="size-5" /> Gửi yêu cầu bảo hành
      </button>
    );
  }
  const input = "w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/40";
  return (
    <form
      className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        f.delete("picker");
        f.set("claimantType", "PATIENT");
        photos.forEach((p) => f.append("images", p.file, p.file.name));
        setLoading(true);
        setError(null);
        try {
          const r = await apiFetch<{ claimNumber: string }>(`/passports/${encodeURIComponent(code)}/claims`, { body: f });
          setDone(r.claimNumber);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <h3 className="font-semibold">Yêu cầu bảo hành</h3>
      <input name="claimantName" required placeholder="Họ tên người liên hệ" className={input} />
      <input name="contactPhone" required inputMode="tel" placeholder="Số điện thoại liên hệ" className={input} />
      <input name="contactEmail" type="email" placeholder="Email (không bắt buộc)" className={input} />
      <textarea name="description" required minLength={10} rows={4} placeholder="Mô tả vấn đề (vị trí răng, hiện tượng, thời điểm…)" className={input} />

      <div>
        <div className="mb-2 text-xs text-white/50">Ảnh tình trạng răng (không bắt buộc) · tối đa {maxImages} ảnh, mỗi ảnh ≤ {maxImageMb} MB</div>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Ảnh ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label="Xoá ảnh"
                onClick={() => setPhotos(photos.filter((x) => x !== p))}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {photos.length < maxImages && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 text-xs text-white/60 hover:border-white/50">
              <ImagePlus className="size-6" /> Thêm ảnh
              <input name="picker" type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      <button disabled={loading} className="h-12 w-full rounded-2xl bg-white font-bold text-[#07111f] disabled:opacity-60">{loading ? "Đang gửi…" : "Gửi yêu cầu"}</button>
    </form>
  );
}
