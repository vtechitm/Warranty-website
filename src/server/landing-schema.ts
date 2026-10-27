import { z } from "zod";

/**
 * Content model of a brand's public page (stored in `Brand.landingConfig`). Every limit here is also written in the
 * media brief (docs/BRIEF-MEDIA-TRANG-THUONG-HIEU.md) — keep them in sync. All sections are optional; empty
 * sections are hidden, and the verification steps fall back to platform defaults.
 */

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`).optional().nullable().transform((v) => (v ? v : null));
const requiredText = (max: number) => z.string().trim().min(1, "Bắt buộc").max(max, `Tối đa ${max} ký tự`);

/** Uploaded asset (/api/v1/brand-assets/…) or an absolute https URL. */
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v) || /^\/api\/v1\/brand-assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(v), "Ảnh phải được tải lên hệ thống hoặc là link https")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Link phải bắt đầu bằng https://")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const LANDING_LIMITS = {
  products: 6, highlights: 4, certificates: 8, steps: 6, care: 8, testimonials: 9, partners: 24, faq: 12,
} as const;

export const landingSchema = z.object({
  seo: z.object({ title: text(70), description: text(160), ogImageUrl: imageUrl }).default({}),
  hero: z.object({ logoUrl: imageUrl, eyebrow: text(40), title: text(90), subtitle: text(220), imageUrl, mobileImageUrl: imageUrl }).default({}),
  story: z.object({ title: text(90), body: text(1500), imageUrl }).default({}),
  origin: z
    .object({
      title: text(90),
      body: text(1500),
      imageUrl,
      highlights: z.array(z.object({ value: requiredText(12), label: requiredText(60) })).max(LANDING_LIMITS.highlights).default([]),
      certificates: z.array(z.object({ name: requiredText(60), imageUrl })).max(LANDING_LIMITS.certificates).default([]),
    })
    .default({}),
  products: z.array(z.object({ name: requiredText(60), tagline: text(80), description: text(300), imageUrl })).max(LANDING_LIMITS.products).default([]),
  warranty: z.object({ title: text(90), body: text(3000) }).default({}),
  steps: z.array(z.object({ title: requiredText(60), body: text(200) })).max(LANDING_LIMITS.steps).default([]),
  care: z.array(requiredText(200)).max(LANDING_LIMITS.care).default([]),
  testimonials: z.array(z.object({ quote: requiredText(300), name: requiredText(60), meta: text(60), avatarUrl: imageUrl })).max(LANDING_LIMITS.testimonials).default([]),
  partners: z.array(z.object({ name: requiredText(60), logoUrl: imageUrl, url: httpsUrl })).max(LANDING_LIMITS.partners).default([]),
  faq: z.array(z.object({ q: requiredText(150), a: requiredText(1000) })).max(LANDING_LIMITS.faq).default([]),
  contact: z.object({ ctaTitle: text(90), ctaBody: text(200), address: text(200), zaloUrl: httpsUrl, facebookUrl: httpsUrl }).default({}),
});

export type LandingContent = z.infer<typeof landingSchema>;
export type LandingInput = z.input<typeof landingSchema>;

/** Platform default for "how to verify" when the brand has not written its own steps. */
export const DEFAULT_STEPS: LandingContent["steps"] = [
  { title: "Quét mã QR hoặc nhập mã", body: "Mã in trên thẻ đi kèm phục hình (2 chữ cái + 8 chữ số)." },
  { title: "Xem nguồn gốc xuất xứ", body: "Phôi chính hãng, thương hiệu, xuất xứ và labo chế tác được Vtech xác nhận." },
  { title: "Xem hồ sơ của bạn", body: "Nhập mã xác thực in trên chứng nhận để xem thông tin phục hình cá nhân." },
  { title: "Liên hệ khi cần bảo hành", body: "Bảo hành do labo chế tác cung cấp — liên hệ phòng khám đã lắp để được hỗ trợ." },
];

/** Parses stored JSON leniently: invalid or legacy content falls back to empty sections instead of breaking the page. */
export function parseLanding(raw: unknown): LandingContent {
  const r = landingSchema.safeParse(raw ?? {});
  return r.success ? r.data : landingSchema.parse({});
}
