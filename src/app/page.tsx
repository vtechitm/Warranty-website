import Link from "next/link";
import { headers } from "next/headers";
import { ShieldCheck, QrCode, Sparkles } from "lucide-react";
import { LookupForm } from "@/components/lookup-form";
import { resolveBrandByHost } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const host = (await headers()).get("host");
  const resolved = await resolveBrandByHost(host);
  const brand = resolved?.brand;
  const primary = brand?.primaryColor ?? "#0B1F3A";
  const gold = brand?.secondaryColor ?? "#C9A96E";

  return (
    <main className="min-h-dvh text-white" style={{ background: `radial-gradient(120% 80% at 50% 0%, ${primary} 0%, #050f1f 70%)` }}>
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <div className="text-lg font-bold tracking-[0.2em]" style={{ color: gold }}>
            {brand ? brand.name.toUpperCase() : "VTECH DENTAL"}
          </div>
          <Link href="/login" className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/80 hover:bg-white/10">
            Đăng nhập labo
          </Link>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest" style={{ borderColor: `${gold}55`, color: gold }}>
            <Sparkles className="size-3.5" /> Truy xuất nguồn gốc xuất xứ
          </span>
          <h1 className="max-w-3xl text-balance text-4xl font-bold leading-tight sm:text-5xl">
            {brand?.tagline ?? "Truy xuất nguồn gốc xuất xứ phôi răng sứ chính hãng"}
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-white/70">
            Quét mã QR trên thẻ hoặc nhập mã để xác thực phôi chính hãng, labo chế tác và thời hạn bảo hành do labo cung cấp.
          </p>
          <div className="mt-10 w-full max-w-xl">
            <LookupForm accent={gold} />
          </div>
          <div className="mt-14 grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
            {[
              { icon: QrCode, t: "Một mã — một ca phục hình", d: "Mã QR cố định suốt vòng đời phục hình." },
              { icon: ShieldCheck, t: "Nguồn gốc rõ ràng", d: "Phôi chính hãng, labo ủy quyền — xác thực bởi Vtech." },
              { icon: Sparkles, t: "Đa thương hiệu", d: "Origin, Elite Zirconia, Overneer và hơn thế." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <Icon className="size-6" style={{ color: gold }} />
                <div className="mt-3 font-semibold">{t}</div>
                <div className="mt-1 text-sm text-white/60">{d}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center text-xs text-white/40">© {new Date().getFullYear()} Vtech Dental Supply · Nền tảng truy xuất nguồn gốc xuất xứ</footer>
      </div>
    </main>
  );
}
