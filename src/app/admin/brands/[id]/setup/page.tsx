import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { brandSetup } from "@/server/services/brand-setup";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Thiết lập thương hiệu" };
export const dynamic = "force-dynamic";

const OWNER_TONE = { Media: "blue", Vtech: "navy", "Tự động": "gray" } as const;

export default async function BrandSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(["SUPER_ADMIN", "BRAND_ADMIN"]);
  const { id } = await params;
  let s;
  try {
    s = await brandSetup(actor, id, { live: true });
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const pct = Math.round((s.done / s.total) * 100);
  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/admin/brands", label: "Thương hiệu" }}
        title={`Thiết lập ${s.brand.name}`}
        description="Làm lần lượt từ trên xuống. Các bước của Media làm bằng tài khoản quản trị thương hiệu; trạng thái tự cập nhật theo dữ liệu thật."
      />
      <div className="card mb-5 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{s.done}/{s.total} bước hoàn tất</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-surface"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <a href={`/b/${s.brand.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-navy-700 underline"><ExternalLink className="size-3" /> Xem trang /b/{s.brand.slug}</a>
          <a href="https://claude.ai/artifact/AbX5kaygpYMA39zDRqZ3Ch" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-navy-700 underline"><ExternalLink className="size-3" /> Brief nội dung cho media</a>
        </div>
      </div>
      <ol className="space-y-3">
        {s.steps.map((step, i) => (
          <li key={step.key} className="card flex items-start gap-4 p-4">
            {step.done ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-6 shrink-0 text-slate-300" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted">Bước {i + 1}</span>
                <span className="font-semibold">{step.title}</span>
                <Badge tone={OWNER_TONE[step.owner]}>{step.owner}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{step.detail}</p>
            </div>
            {step.href &&
              (step.href.startsWith("http") ? (
                <a href={step.href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm font-semibold text-navy-700 hover:underline">Mở <ExternalLink className="inline size-3.5" /></a>
              ) : (
                <Link href={step.href} className="shrink-0 text-sm font-semibold text-navy-700 hover:underline">{step.done ? "Xem" : "Làm"} <ArrowRight className="inline size-3.5" /></Link>
              ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
