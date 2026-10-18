import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPrivatePassport, getPublicPassport, PATIENT_ACCESS_COOKIE, phoneOtpEnabled, readPatientAccessToken } from "@/server/services/passport";
import { claimImageLimits } from "@/server/services/claim-images";
import { primaryDomain, resolveBrandByHost } from "@/server/services/catalog";
import { clientIp } from "@/server/http/handler";
import { AppError } from "@/server/errors";
import { PassportView } from "./passport-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: `Chứng nhận ${decodeURIComponent(code).toUpperCase()}`, robots: { index: false, follow: false } };
}

export default async function WarrantyPage({ params }: Props) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  const h = await headers();

  // Canonical-domain redirects (only for verified brand domains flagged for redirect).
  const resolved = await resolveBrandByHost(h.get("host"));
  if (resolved?.domain.redirectToPrimary) {
    const primary = primaryDomain(resolved.brand);
    if (primary && primary.hostname !== resolved.domain.hostname) redirect(`https://${primary.hostname}/w/${encodeURIComponent(code)}`);
  }

  let passport;
  try {
    passport = await getPublicPassport(code, clientIp(h));
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") return <Message title="Quá nhiều lượt tra cứu" body="Vui lòng thử lại sau ít phút." />;
    throw e;
  }
  if (!passport) {
    return <Message title="Không tìm thấy mã bảo hành" body="Mã bạn quét hoặc nhập không tồn tại trong hệ thống. Vui lòng kiểm tra lại mã trên thẻ bảo hành hoặc liên hệ phòng khám." />;
  }

  const token = (await cookies()).get(PATIENT_ACCESS_COOKIE)?.value;
  const verified = passport.state !== "NOT_ACTIVATED" && passport.state !== "REVOKED" && (await readPatientAccessToken(token, passport.code));
  const privateData = verified ? await getPrivatePassport(passport.code) : null;

  const limits = claimImageLimits();
  return (
    <PassportView
      passport={passport}
      privateData={privateData}
      options={{ otpEnabled: phoneOtpEnabled(), maxImages: limits.maxCount, maxImageMb: Math.floor(limits.maxBytes / 1024 / 1024) }}
    />
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-950 p-6 text-center text-white">
      <div className="max-w-sm">
        <div className="text-sm font-bold tracking-[0.3em] text-gold-500">VTECH DENTAL</div>
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-white/60">{body}</p>
        <a href="/" className="mt-8 inline-block rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10">Tra cứu mã khác</a>
      </div>
    </main>
  );
}
