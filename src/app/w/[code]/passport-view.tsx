import { AlertOctagon, BadgeCheck, CalendarClock, Clock, Download, Globe, Hourglass, Mail, Phone, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import type { PrivatePassport, PublicPassport } from "@/server/services/passport";
import { fmtDate, fmtDateVN, fmtDuration, lastCoveredDay } from "@/lib/format";
import { ToothChart } from "@/components/tooth-chart";
import { VerifyPanel } from "./verify-panel";
import { ClaimForm } from "./claim-form";

const DEFAULT_CARE = [
  "Chải răng 2 lần/ngày bằng bàn chải lông mềm và kem đánh răng không chứa hạt mài.",
  "Dùng chỉ nha khoa hoặc tăm nước để làm sạch kẽ răng và vùng tiếp giáp phục hình.",
  "Tránh cắn vật cứng (đá lạnh, xương, vỏ cua…) và không dùng răng để mở nắp chai.",
  "Nếu có thói quen nghiến răng, hãy hỏi bác sĩ về máng bảo vệ khi ngủ.",
  "Tái khám định kỳ 6 tháng/lần để kiểm tra phục hình và vệ sinh chuyên sâu.",
];

const HEADLINE: Record<PublicPassport["state"], { title: string; sub: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  ACTIVE: { title: "CHỨNG NHẬN PHỤC HÌNH CHÍNH HÃNG", sub: "Phục hình đã được kích hoạt bảo hành bởi labo được ủy quyền", tone: "ok" },
  PENDING_INSTALLATION: { title: "CHỨNG NHẬN PHỤC HÌNH CHÍNH HÃNG", sub: "Bảo hành sẽ bắt đầu khi ngày lắp cho bệnh nhân được xác nhận", tone: "warn" },
  NOT_ACTIVATED: { title: "CHỨNG NHẬN CHƯA ĐƯỢC KÍCH HOẠT", sub: "Mã hợp lệ nhưng chưa được labo kích hoạt cho ca phục hình nào", tone: "muted" },
  EXPIRED: { title: "BẢO HÀNH ĐÃ HẾT HẠN", sub: "Phục hình chính hãng — thời hạn bảo hành đã kết thúc", tone: "muted" },
  SUSPENDED: { title: "BẢO HÀNH ĐANG TẠM NGƯNG", sub: "Vui lòng liên hệ bộ phận hỗ trợ để biết thêm chi tiết", tone: "warn" },
  REVOKED: { title: "CẢNH BÁO: CHỨNG NHẬN ĐÃ BỊ THU HỒI", sub: "Mã này không còn hiệu lực và KHÔNG phải là chứng nhận bảo hành hợp lệ", tone: "bad" },
};

function remaining(end: string | null) {
  if (!end) return null;
  const now = new Date();
  const e = new Date(end);
  let months = (e.getUTCFullYear() - now.getUTCFullYear()) * 12 + (e.getUTCMonth() - now.getUTCMonth());
  if (e.getUTCDate() < now.getUTCDate()) months -= 1;
  if (months <= 0) {
    const days = Math.max(0, Math.ceil((e.getTime() - now.getTime()) / 86_400_000));
    return `${days} ngày`;
  }
  return fmtDuration(months);
}

type ViewOptions = { otpEnabled: boolean; maxImages: number; maxImageMb: number };

export function PassportView({ passport: p, privateData, options }: { passport: PublicPassport; privateData: PrivatePassport | null; options?: ViewOptions }) {
  const primary = p.brand.primaryColor;
  const gold = p.brand.secondaryColor;
  const h = HEADLINE[p.state];
  const activated = p.state === "ACTIVE" || p.state === "PENDING_INSTALLATION" || p.state === "EXPIRED" || p.state === "SUSPENDED";
  const start = p.warrantyStartDate ? new Date(p.warrantyStartDate).getTime() : null;
  const end = p.warrantyEndDate ? new Date(p.warrantyEndDate).getTime() : null;
  const progress = start && end ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
  const lastDay = lastCoveredDay(p.warrantyEndDate);
  const care = p.policy?.careInstructions?.split(/\r?\n/).filter(Boolean) ?? DEFAULT_CARE;
  const benefits = p.policy?.benefits?.split(/\r?\n/).filter(Boolean);

  return (
    <main className="min-h-dvh pb-16 text-white" style={{ background: `linear-gradient(180deg, ${primary} 0%, #050b16 55%, #050b16 100%)` }}>
      <div className="mx-auto max-w-md px-4 pt-6 sm:max-w-lg">
        {/* Brand bar */}
        <header className="flex items-center justify-between">
          {p.brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.brand.logoUrl} alt={p.brand.name} className="h-8 w-auto" />
          ) : (
            <div className="text-lg font-bold tracking-[0.3em]" style={{ color: gold }}>{p.brand.name.toUpperCase()}</div>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Digital Dental Passport</span>
        </header>

        {/* Certificate card */}
        <section className="relative mt-6 overflow-hidden rounded-[28px] p-[1px]" style={{ background: `linear-gradient(140deg, ${gold}, ${gold}22 40%, ${gold}88)` }}>
          <div className="relative overflow-hidden rounded-[27px] px-5 pb-6 pt-6" style={{ background: `radial-gradient(120% 70% at 100% 0%, ${primary} 0%, #07111f 65%)` }}>
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-20 blur-2xl" style={{ background: gold }} />

            <StateBanner tone={h.tone} title={h.title} sub={h.sub} gold={gold} />

            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Sản phẩm</div>
              <div className="mt-1 text-2xl font-bold leading-tight">{p.product.name}</div>
              {p.product.materialType && <div className="mt-0.5 text-sm text-white/60">{p.product.materialType}</div>}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Số chứng nhận</div>
              <div className="mono mt-1 text-xl font-bold" style={{ color: gold }}>{p.code}</div>
            </div>

            {activated && p.state !== "PENDING_INSTALLATION" && start && end && (
              <div className="mt-5">
                <div className="flex justify-between text-xs text-white/60">
                  <span>{fmtDate(p.warrantyStartDate)}</span>
                  <span>{lastDay ? fmtDate(lastDay) : "—"}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, background: p.state === "ACTIVE" ? `linear-gradient(90deg, ${gold}, #f3e3bf)` : "#64748b" }} />
                </div>
                {p.state === "ACTIVE" && (
                  <div className="mt-2 text-right text-xs text-white/70">
                    Còn lại <span className="font-semibold" style={{ color: gold }}>{remaining(p.warrantyEndDate)}</span>
                  </div>
                )}
              </div>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <Fact icon={<Hourglass />} label="Thời hạn bảo hành" value={fmtDuration(p.durationMonths)} />
              {activated ? (
                <>
                  <Fact icon={<CalendarClock />} label="Ngày kích hoạt" value={fmtDateVN(p.activatedAt)} />
                  <Fact icon={<Clock />} label="Hiệu lực đến hết" value={lastDay ? fmtDate(lastDay) : "Chờ xác nhận"} />
                  <Fact icon={<Sparkles />} label="Số đơn vị" value={p.unitCount ? `${p.unitCount} răng` : "—"} />
                </>
              ) : (
                <Fact icon={<BadgeCheck />} label="Trạng thái" value={p.state === "REVOKED" ? "Đã thu hồi" : "Chưa kích hoạt"} />
              )}
            </dl>
            {activated && p.authorizedLaboratory && (
              <div className="mt-4 border-t border-white/10 pt-4 text-xs text-white/60">
                Kích hoạt bởi labo ủy quyền: <span className="font-semibold text-white/90">{p.authorizedLaboratory}</span>
              </div>
            )}
          </div>
        </section>

        {p.state === "REVOKED" && (
          <div className="mt-5 rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-5" /> Không sử dụng chứng nhận này</div>
            <p className="mt-2 text-red-100/80">
              Mã đã bị Vtech thu hồi (có thể do thẻ bị thất lạc, sao chép hoặc phát hành sai). Vui lòng liên hệ phòng khám hoặc hotline thương hiệu để được hỗ trợ.
            </p>
          </div>
        )}

        {p.state === "NOT_ACTIVATED" && (
          <Panel title="Thẻ bảo hành chưa được kích hoạt">
            <p className="text-sm text-white/70">
              Nếu bạn đã được lắp phục hình, vui lòng liên hệ phòng khám để labo kích hoạt bảo hành. Sau khi kích hoạt, bạn có thể quét lại chính mã QR này — mã không thay đổi.
            </p>
          </Panel>
        )}

        {/* Private section */}
        {activated && (
          <Panel title="Hồ sơ phục hình của bạn">
            {privateData ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <PrivFact label="Bệnh nhân" value={privateData.patientName} />
                  <PrivFact label="Loại phục hình" value={privateData.restorationType} />
                  <PrivFact label="Phòng khám" value={privateData.clinicName ?? "—"} />
                  <PrivFact label="Bác sĩ" value={privateData.dentistName ?? "—"} />
                  <PrivFact label="Ngày lắp" value={fmtDate(privateData.installationDate)} />
                  <PrivFact label="Vị trí răng" value={privateData.teeth.map((t) => t.toothNumber).join(", ")} />
                </dl>
                <div className="rounded-2xl bg-white p-3">
                  <ToothChart selected={privateData.teeth.map((t) => t.toothNumber)} readOnly accent={primary} showPrimary={privateData.teeth.some((t) => t.toothNumber > 50)} />
                </div>
              </div>
            ) : (
              <VerifyPanel code={p.code} gold={gold} otpEnabled={options?.otpEnabled} />
            )}
          </Panel>
        )}

        {activated && (
          <div className="mt-5 grid gap-3">
            <a
              href={`/api/v1/passports/${encodeURIComponent(p.code)}/certificate`}
              target="_blank"
              className="flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-bold text-[#07111f] shadow-lg"
              style={{ background: `linear-gradient(90deg, ${gold}, #f0dcb2)` }}
            >
              <Download className="size-5" /> TẢI CHỨNG NHẬN BẢO HÀNH (PDF)
            </a>
            {privateData && p.state === "ACTIVE" && <ClaimForm code={p.code} maxImages={options?.maxImages} maxImageMb={options?.maxImageMb} />}
          </div>
        )}

        {benefits && benefits.length > 0 && (
          <Panel title="Quyền lợi bảo hành">
            <ul className="space-y-2 text-sm text-white/80">
              {benefits.map((b) => (
                <li key={b} className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: gold }} /> {b}</li>
              ))}
            </ul>
          </Panel>
        )}

        {p.state !== "REVOKED" && (
          <Panel title="Hướng dẫn chăm sóc phục hình">
            <ol className="space-y-2.5 text-sm text-white/80">
              {care.map((c, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#07111f]" style={{ background: gold }}>{i + 1}</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </Panel>
        )}

        {(p.policy?.conditions || p.policy?.exclusions || p.policy?.claimInstructions) && (
          <Panel title="Điều khoản bảo hành">
            <div className="space-y-2 text-sm">
              <Terms title="Điều kiện bảo hành" body={p.policy.conditions} />
              <Terms title="Trường hợp không bảo hành" body={p.policy.exclusions} />
              <Terms title="Thủ tục yêu cầu bảo hành" body={p.policy.claimInstructions} />
              {p.policy.version > 0 && <p className="pt-1 text-xs text-white/40">Áp dụng chính sách phiên bản {p.policy.version} tại thời điểm kích hoạt.</p>}
            </div>
          </Panel>
        )}

        <Panel title={p.state === "EXPIRED" ? "Hỗ trợ sau bảo hành" : "Liên hệ hỗ trợ"}>
          <div className="space-y-2 text-sm text-white/80">
            {p.brand.supportPhone && <a href={`tel:${p.brand.supportPhone}`} className="flex items-center gap-2"><Phone className="size-4" style={{ color: gold }} /> {p.brand.supportPhone}</a>}
            {p.brand.supportEmail && <a href={`mailto:${p.brand.supportEmail}`} className="flex items-center gap-2"><Mail className="size-4" style={{ color: gold }} /> {p.brand.supportEmail}</a>}
            {p.brand.websiteUrl && <a href={p.brand.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2"><Globe className="size-4" style={{ color: gold }} /> {p.brand.websiteUrl.replace(/^https?:\/\//, "")}</a>}
            {p.state === "EXPIRED" && <p className="pt-1 text-white/60">Bảo hành đã kết thúc. Bạn vẫn có thể liên hệ phòng khám để được kiểm tra, sửa chữa hoặc tư vấn phục hình mới.</p>}
          </div>
        </Panel>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-white/35">
          Mã QR là định danh của chứng nhận điện tử. Tình trạng bảo hành luôn được xác thực trực tiếp tại trang này.
          <br />© Vtech Dental Supply · {p.brand.name}
        </p>
      </div>
    </main>
  );
}

function StateBanner({ tone, title, sub, gold }: { tone: "ok" | "warn" | "bad" | "muted"; title: string; sub: string; gold: string }) {
  const Icon = tone === "ok" ? ShieldCheck : tone === "bad" ? AlertOctagon : tone === "warn" ? Clock : BadgeCheck;
  const color = tone === "ok" ? "#4ade80" : tone === "bad" ? "#f87171" : tone === "warn" ? "#fbbf24" : "#94a3b8";
  return (
    <div className="flex gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${color}1f`, color }}>
        <Icon className="size-6" />
      </div>
      <div>
        <div className="text-[15px] font-bold leading-snug tracking-wide" style={{ color: tone === "ok" ? gold : tone === "bad" ? "#fca5a5" : "white" }}>{title}</div>
        <div className="mt-0.5 text-xs text-white/60">{sub}</div>
        {tone === "ok" && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            <BadgeCheck className="size-3.5" /> Đã xác thực trên hệ thống Vtech
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50 [&_svg]:size-3.5">{icon} {label}</dt>
      <dd className="mt-1 font-semibold text-white">{value}</dd>
    </div>
  );
}

function PrivFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-white/50">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-white/60">{title}</h2>
      {children}
    </section>
  );
}

function Terms({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <details className="group rounded-2xl bg-white/[0.04] px-4 py-3">
      <summary className="cursor-pointer list-none font-semibold text-white/90 marker:hidden">{title}</summary>
      <p className="mt-2 whitespace-pre-line text-white/70">{body}</p>
    </details>
  );
}
