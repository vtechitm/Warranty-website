import { prisma } from "../db";
import { notFound } from "../errors";
import { assertBrandAccess, assertCan, type Actor } from "../auth/permissions";
import { parseLanding } from "../landing-schema";
import { primaryDomain } from "./catalog";

/**
 * Brand onboarding checklist ("Thiết lập thương hiệu"). Every step is computed from real data, so the list is
 * always current. `owner` tells who does the step: the brand's media team (brand admin account) or Vtech.
 * The order follows docs/QUY-TRINH-THIET-LAP-THUONG-HIEU.md.
 */
export type SetupStep = {
  key: "identity" | "products" | "landing" | "domain" | "https" | "labs" | "batch";
  title: string;
  owner: "Media" | "Vtech" | "Tự động";
  done: boolean;
  detail: string;
  href: string | null;
};

const LANDING_SECTIONS = ["story", "origin", "products", "warranty", "testimonials", "faq"] as const;

export async function brandSetup(actor: Actor, brandId: string, opts: { live?: boolean } = {}) {
  assertCan(actor, "brand:read");
  assertBrandAccess(actor, brandId);
  const brand = await prisma.brand.findFirst({ where: { id: brandId, deletedAt: null }, include: { domains: true } });
  if (!brand) throw notFound("Thương hiệu không tồn tại");

  const [products, labCount, batches] = await Promise.all([
    prisma.product.findMany({
      where: { brandId, deletedAt: null, isActive: true },
      select: { name: true, origin: true, policies: { where: { isCurrent: true }, select: { id: true }, take: 1 } },
    }),
    prisma.laboratoryBrand.count({ where: { brandId, laboratory: { deletedAt: null, status: "ACTIVE" } } }),
    prisma.warrantyBatch.findMany({ where: { brandId }, select: { qrBaseUrl: true } }),
  ]);
  const landing = parseLanding(brand.landingConfig);
  const primary = primaryDomain(brand);
  const pendingDomain = brand.domains.find((d) => !d.verifiedAt);
  const primaryUrl = primary ? `https://${primary.hostname}` : null;

  const logo = brand.logoUrl ?? landing.hero.logoUrl;
  const completeProducts = products.filter((p) => p.origin && p.policies.length > 0);
  const filledSections = LANDING_SECTIONS.filter((k) => {
    const v = landing[k];
    if (Array.isArray(v)) return v.length > 0;
    return Object.values(v as Record<string, unknown>).some((x) => (Array.isArray(x) ? x.length > 0 : !!x));
  });
  const heroReady = !!landing.hero.title && !!landing.hero.imageUrl;

  let httpsOk = false;
  if (opts.live && primary) httpsOk = await reachable(`${primaryUrl}/api/health`);

  const steps: SetupStep[] = [
    {
      key: "identity", title: "Nhận diện thương hiệu", owner: "Media", done: !!logo && !!brand.supportPhone,
      detail: [logo ? "Đã có logo" : "Thiếu logo", brand.supportPhone ? `hotline ${brand.supportPhone}` : "thiếu hotline", "màu chính / phụ / nền"].join(" · "),
      href: "/admin/brands",
    },
    {
      key: "products", title: "Sản phẩm (phôi) & xuất xứ", owner: "Media", done: completeProducts.length > 0,
      detail: products.length === 0 ? "Chưa có sản phẩm" : `${completeProducts.length}/${products.length} sản phẩm có xuất xứ và thông tin phôi (thời hạn bảo hành gợi ý)`,
      href: "/admin/products",
    },
    {
      key: "landing", title: "Trang thương hiệu", owner: "Media", done: heroReady && filledSections.length >= 3,
      detail: `${heroReady ? "Banner đã có tiêu đề + ảnh" : "Banner cần tiêu đề và ảnh"} · ${filledSections.length}/${LANDING_SECTIONS.length} phần nội dung (cần ≥ 3)`,
      href: `/admin/brands/${brandId}/landing`,
    },
    {
      key: "domain", title: "Tên miền riêng", owner: "Media", done: !!primary,
      detail: primary
        ? `${primary.hostname} — đã xác minh, là tên miền chính`
        : pendingDomain
          ? `${pendingDomain.hostname} — chờ xác minh DNS`
          : brand.domains.some((d) => d.verifiedAt)
            ? "Đã xác minh nhưng chưa đặt làm tên miền chính"
            : "Chưa thêm tên miền (VD: baohanh.<thương-hiệu>.vn)",
      href: "/admin/brands",
    },
    {
      key: "https", title: "Trang chạy qua HTTPS", owner: "Tự động", done: httpsOk,
      detail: !primary ? "Sau khi có tên miền chính" : !opts.live ? "Mở trang thiết lập để kiểm tra" : httpsOk ? `${primaryUrl} hoạt động` : `Chưa truy cập được ${primaryUrl} — kiểm tra bản ghi A, chờ DNS cập nhật (tối đa vài giờ)`,
      href: primaryUrl,
    },
    {
      key: "labs", title: "Labo được ủy quyền", owner: "Vtech", done: labCount > 0,
      detail: labCount > 0 ? `${labCount} labo được ủy quyền cho thương hiệu` : "Vtech ủy quyền labo cho thương hiệu",
      href: "/admin/laboratories",
    },
    {
      key: "batch", title: "Lô mã đầu tiên in tên miền thương hiệu", owner: "Vtech", done: !!primaryUrl && batches.some((b) => b.qrBaseUrl === primaryUrl),
      detail: !primaryUrl
        ? "Chờ tên miền chính — QR của lô sinh trước đó sẽ in địa chỉ nền tảng"
        : batches.some((b) => b.qrBaseUrl === primaryUrl)
          ? `Đã có lô mã in ${primary!.hostname}`
          : batches.length
            ? `${batches.length} lô đã sinh trước khi có tên miền (in địa chỉ nền tảng, vẫn dùng được) — sinh lô mới để QR in ${primary!.hostname}`
            : "Vtech sinh lô mã — QR sẽ in tên miền thương hiệu",
      href: "/admin/batches",
    },
  ];
  return { brand: { id: brand.id, name: brand.name, slug: brand.slug }, steps, done: steps.filter((s) => s.done).length, total: steps.length };
}

async function reachable(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}
