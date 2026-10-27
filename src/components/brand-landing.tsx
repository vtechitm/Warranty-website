import { BadgeCheck, ChevronDown, Globe, Mail, MapPin, MessageCircle, Phone, Quote, Share2, ShieldCheck } from "lucide-react";
import type { Brand } from "@prisma/client";
import { DEFAULT_STEPS, type LandingContent } from "@/server/landing-schema";
import { LookupForm } from "@/components/lookup-form";

/**
 * Public brand page (brand domain home or /b/{slug}). Sections render only when they have content, so a brand can
 * go live with just a banner and grow the page as media delivers material (see docs/BRIEF-MEDIA-TRANG-THUONG-HIEU.md).
 */
export function BrandLanding({ brand, content: c }: { brand: Brand; content: LandingContent }) {
  const primary = brand.primaryColor;
  const gold = brand.secondaryColor;
  const cream = brand.accentColor && brand.accentColor.toLowerCase() !== "#f5f5f7" ? brand.accentColor : "#F7F2EA";
  const steps = c.steps.length ? c.steps : DEFAULT_STEPS;
  const hasOrigin = c.origin.title || c.origin.body || c.origin.highlights.length || c.origin.certificates.length;
  const hasWarranty = c.warranty.body || c.care.length;
  const nav = [
    c.products.length && ["#san-pham", "Sản phẩm"],
    hasOrigin && ["#nguon-goc", "Nguồn gốc"],
    ["#xac-thuc", "Xác thực"],
    hasWarranty && ["#bao-hanh", "Bảo hành"],
    c.faq.length && ["#hoi-dap", "Hỏi đáp"],
  ].filter(Boolean) as [string, string][];

  return (
    <main className="min-h-dvh bg-white text-[#1b2433]" style={{ ["--b-primary" as string]: primary, ["--b-gold" as string]: gold }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#top" className="flex items-center gap-2">
            {c.hero.logoUrl || brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(c.hero.logoUrl ?? brand.logoUrl)!} alt={brand.name} className="h-9 w-auto" />
            ) : (
              <span className="text-xl font-bold tracking-[0.25em]" style={{ color: primary }}>{brand.name.toUpperCase()}</span>
            )}
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#1b2433]/70 md:flex">
            {nav.map(([href, label]) => <a key={href} href={href} className="hover:text-[#1b2433]">{label}</a>)}
          </nav>
          <a href="#tra-cuu" className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm" style={{ background: primary }}>
            <ShieldCheck className="mr-1.5 inline size-4" />Tra cứu
          </a>
        </div>
      </header>

      {/* Hero + lookup */}
      <section id="top" className="relative overflow-hidden text-white" style={{ background: `linear-gradient(135deg, ${primary}, #050f1f)` }}>
        {c.hero.imageUrl && (
          <picture>
            {c.hero.mobileImageUrl && <source media="(max-width: 767px)" srcSet={c.hero.mobileImageUrl} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.hero.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
          </picture>
        )}
        <div className="absolute inset-0" style={{ background: c.hero.imageUrl ? "linear-gradient(90deg, rgba(5,15,31,.82) 0%, rgba(5,15,31,.55) 55%, rgba(5,15,31,.15) 100%)" : undefined }} />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ borderColor: `${gold}66`, color: gold }}>
              <BadgeCheck className="size-3.5" /> {c.hero.eyebrow ?? "Truy xuất nguồn gốc xuất xứ"}
            </span>
            <h1 className="text-balance text-3xl font-bold leading-tight sm:text-5xl">{c.hero.title ?? brand.tagline ?? `Răng sứ ${brand.name} chính hãng`}</h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-white/75 sm:text-lg">
              {c.hero.subtitle ?? "Quét mã QR trên thẻ hoặc nhập mã để xác thực phôi chính hãng, labo chế tác và thời hạn bảo hành do labo cung cấp."}
            </p>
          </div>
          <div id="tra-cuu" className="self-center rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-md sm:p-7">
            <div className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: gold }}>Tra cứu nguồn gốc</div>
            <p className="mt-1 text-sm text-white/70">Nhập mã in trên thẻ (2 chữ cái + 8 chữ số)</p>
            <div className="mt-4"><LookupForm accent={gold} /></div>
          </div>
        </div>
      </section>

      {/* How to verify */}
      <section id="xac-thuc" className="py-16" style={{ background: cream }}>
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle eyebrow="Xác thực chính hãng" title="Kiểm tra nguồn gốc chỉ trong vài giây" gold={gold} />
          <ol className={`mt-10 grid gap-4 sm:grid-cols-2 ${steps.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {steps.map((s, i) => (
              <li key={i} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="text-3xl font-bold" style={{ color: gold }}>{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-3 font-semibold">{s.title}</div>
                {s.body && <p className="mt-1.5 text-sm text-[#1b2433]/65">{s.body}</p>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Story */}
      {(c.story.title || c.story.body) && (
        <section className="py-20">
          <div className={`mx-auto grid max-w-6xl items-center gap-10 px-4 ${c.story.imageUrl ? "md:grid-cols-2" : ""}`}>
            {c.story.imageUrl && <Img src={c.story.imageUrl} className="aspect-[4/3] w-full rounded-[2rem] object-cover" />}
            <div className={c.story.imageUrl ? "" : "mx-auto max-w-3xl text-center"}>
              {c.story.title && <h2 className="text-balance text-3xl font-bold leading-tight sm:text-4xl" style={{ color: primary }}>{c.story.title}</h2>}
              <Paragraphs text={c.story.body} className="mt-5 space-y-4 text-[#1b2433]/75" />
            </div>
          </div>
        </section>
      )}

      {/* Origin & certifications */}
      {hasOrigin && (
        <section id="nguon-goc" className="py-20 text-white" style={{ background: `linear-gradient(160deg, ${primary}, #050f1f)` }}>
          <div className={`mx-auto grid max-w-6xl items-center gap-10 px-4 ${c.origin.imageUrl ? "md:grid-cols-[1fr_1fr]" : ""}`}>
            <div>
              <SectionTitle eyebrow="Nguồn gốc xuất xứ" title={c.origin.title ?? `Xuất xứ ${brand.name}`} gold={gold} light align="left" />
              <Paragraphs text={c.origin.body} className="mt-5 space-y-4 text-white/75" />
              {c.origin.highlights.length > 0 && (
                <dl className="mt-8 grid grid-cols-2 gap-4">
                  {c.origin.highlights.map((h, i) => (
                    <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <dt className="text-2xl font-bold" style={{ color: gold }}>{h.value}</dt>
                      <dd className="mt-1 text-sm text-white/70">{h.label}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {c.origin.imageUrl && <Img src={c.origin.imageUrl} className="aspect-[4/3] w-full rounded-[2rem] object-cover" />}
          </div>
          {c.origin.certificates.length > 0 && (
            <div className="mx-auto mt-12 max-w-6xl px-4">
              <div className="flex flex-wrap items-center justify-center gap-4">
                {c.origin.certificates.map((cert, i) => (
                  <div key={i} className="flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-2xl bg-white p-3 text-center">
                    {cert.imageUrl ? <Img src={cert.imageUrl} alt={cert.name} className="max-h-12 w-auto object-contain" /> : <BadgeCheck className="size-8" style={{ color: primary }} />}
                    <span className="text-[11px] font-semibold text-[#1b2433]/70">{cert.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Products */}
      {c.products.length > 0 && (
        <section id="san-pham" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle eyebrow="Dòng sản phẩm" title={`Phôi ${brand.name} chính hãng`} gold={gold} />
            <div className={`mt-10 grid gap-6 sm:grid-cols-2 ${c.products.length >= 3 ? "lg:grid-cols-3" : ""}`}>
              {c.products.map((p, i) => (
                <article key={i} className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
                  <div className="flex aspect-square items-center justify-center p-6" style={{ background: cream }}>
                    {p.imageUrl ? <Img src={p.imageUrl} alt={p.name} className="max-h-full w-auto object-contain" /> : <ShieldCheck className="size-16" style={{ color: gold }} />}
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold" style={{ color: primary }}>{p.name}</h3>
                    {p.tagline && <div className="mt-0.5 text-sm font-semibold" style={{ color: gold }}>{p.tagline}</div>}
                    {p.description && <p className="mt-3 text-sm text-[#1b2433]/70">{p.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Warranty info + care */}
      {hasWarranty && (
        <section id="bao-hanh" className="py-20" style={{ background: cream }}>
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1.3fr_1fr]">
            <div>
              <SectionTitle eyebrow="Bảo hành" title={c.warranty.title ?? "Thông tin bảo hành"} gold={gold} align="left" />
              <p className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: `${gold}66`, background: "#fff" }}>
                <ShieldCheck className="mr-1.5 inline size-4" style={{ color: gold }} />
                Thời hạn bảo hành do <b>labo chế tác</b> cung cấp và hiển thị khi bạn tra cứu mã. Khi cần bảo hành, vui lòng liên hệ phòng khám đã lắp.
              </p>
              <Paragraphs text={c.warranty.body} className="mt-5 space-y-3 text-[#1b2433]/75" />
            </div>
            {c.care.length > 0 && (
              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <h3 className="font-bold" style={{ color: primary }}>Chăm sóc răng sứ sau khi gắn</h3>
                <ol className="mt-4 space-y-3 text-sm text-[#1b2433]/75">
                  {c.care.map((t, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: gold }}>{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {c.testimonials.length > 0 && (
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle eyebrow="Khách hàng" title={`Cảm nhận về ${brand.name}`} gold={gold} />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {c.testimonials.map((t, i) => (
                <figure key={i} className="flex flex-col rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
                  <Quote className="size-7" style={{ color: gold }} />
                  <blockquote className="mt-3 flex-1 text-[#1b2433]/80">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    {t.avatarUrl ? <Img src={t.avatarUrl} alt={t.name} className="size-11 rounded-full object-cover" /> : <span className="flex size-11 items-center justify-center rounded-full font-bold text-white" style={{ background: primary }}>{t.name.charAt(0)}</span>}
                    <span>
                      <span className="block font-semibold">{t.name}</span>
                      {t.meta && <span className="block text-xs text-[#1b2433]/55">{t.meta}</span>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Partners */}
      {c.partners.length > 0 && (
        <section className="border-y border-black/5 py-16" style={{ background: cream }}>
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle eyebrow="Đối tác" title="Được tin chọn bởi các labo & nha khoa" gold={gold} />
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {c.partners.map((p, i) => {
                const inner = p.logoUrl ? <Img src={p.logoUrl} alt={p.name} className="max-h-12 w-auto object-contain" /> : <span className="text-center text-sm font-semibold text-[#1b2433]/70">{p.name}</span>;
                return p.url ? (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" title={p.name} className="flex h-20 items-center justify-center rounded-2xl bg-white p-3 grayscale transition hover:grayscale-0">{inner}</a>
                ) : (
                  <div key={i} title={p.name} className="flex h-20 items-center justify-center rounded-2xl bg-white p-3">{inner}</div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {c.faq.length > 0 && (
        <section id="hoi-dap" className="py-20">
          <div className="mx-auto max-w-3xl px-4">
            <SectionTitle eyebrow="Hỏi đáp" title="Câu hỏi thường gặp" gold={gold} />
            <div className="mt-10 space-y-3">
              {c.faq.map((f, i) => (
                <details key={i} className="group rounded-2xl border border-black/10 bg-white px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden">
                    {f.q}
                    <ChevronDown className="size-5 shrink-0 transition group-open:rotate-180" style={{ color: gold }} />
                  </summary>
                  <Paragraphs text={f.a} className="mt-3 space-y-2 text-sm text-[#1b2433]/70" />
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact */}
      <section className="py-16 text-white" style={{ background: `linear-gradient(135deg, ${primary}, #050f1f)` }}>
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-balance text-2xl font-bold sm:text-3xl">{c.contact.ctaTitle ?? "Bạn cần tư vấn thêm về răng sứ?"}</h2>
            <p className="mt-3 text-white/70">{c.contact.ctaBody ?? `Liên hệ ${brand.name} để được hỗ trợ xác thực sản phẩm và tìm phòng khám, labo đối tác gần bạn.`}</p>
          </div>
          <div className="space-y-2.5 text-sm">
            {brand.supportPhone && <ContactLine href={`tel:${brand.supportPhone.replace(/\s/g, "")}`} icon={<Phone />} gold={gold}>Hotline: <b>{brand.supportPhone}</b></ContactLine>}
            {c.contact.zaloUrl && <ContactLine href={c.contact.zaloUrl} icon={<MessageCircle />} gold={gold} external>Zalo</ContactLine>}
            {c.contact.facebookUrl && <ContactLine href={c.contact.facebookUrl} icon={<Share2 />} gold={gold} external>Facebook</ContactLine>}
            {brand.supportEmail && <ContactLine href={`mailto:${brand.supportEmail}`} icon={<Mail />} gold={gold}>{brand.supportEmail}</ContactLine>}
            {brand.websiteUrl && <ContactLine href={brand.websiteUrl} icon={<Globe />} gold={gold} external>{brand.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</ContactLine>}
            {c.contact.address && <ContactLine icon={<MapPin />} gold={gold}>{c.contact.address}</ContactLine>}
          </div>
        </div>
      </section>

      <footer className="bg-[#050f1f] py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} {brand.name} · Nền tảng truy xuất nguồn gốc xuất xứ bởi Vtech Dental Supply
      </footer>
    </main>
  );
}

function SectionTitle({ eyebrow, title, gold, light = false, align = "center" }: { eyebrow: string; title: string; gold: string; light?: boolean; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <div className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: gold }}>{eyebrow}</div>
      <h2 className={`mt-2 text-balance text-3xl font-bold leading-tight sm:text-4xl ${light ? "text-white" : "text-[var(--b-primary)]"}`}>{title}</h2>
    </div>
  );
}

function Paragraphs({ text, className }: { text: string | null; className?: string }) {
  if (!text) return null;
  return (
    <div className={className}>
      {text.split(/\r?\n\s*\r?\n|\r?\n/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}

function Img({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}

function ContactLine({ href, icon, gold, external, children }: { href?: string; icon: React.ReactNode; gold: string; external?: boolean; children: React.ReactNode }) {
  const body = (
    <span className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 [&_svg]:size-4">
      <span style={{ color: gold }}>{icon}</span>
      <span>{children}</span>
    </span>
  );
  return href ? <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="block hover:opacity-90">{body}</a> : body;
}
