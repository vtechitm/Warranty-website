"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, MessageSquareLock, Smartphone } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";

type Method = "ACCESS_CODE" | "PHONE_NUMBER" | "PHONE_OTP";

/** Patient verification: access code from the certificate, the registered phone number, or a one-time code sent to it. */
export function VerifyPanel({ code, gold, otpEnabled = false }: { code: string; gold: string; otpEnabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("ACCESS_CODE");
  const [value, setValue] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState<{ maskedPhone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <div className="text-sm text-white/70">
        <p className="flex gap-2">
          <Lock className="mt-0.5 size-4 shrink-0" style={{ color: gold }} />
          Thông tin cá nhân (tên, phòng khám, vị trí răng) được bảo mật và chỉ hiển thị sau khi xác thực bạn là bệnh nhân.
        </p>
        <button onClick={() => setOpen(true)} className="mt-4 h-12 w-full rounded-2xl border font-semibold" style={{ borderColor: `${gold}88`, color: gold }}>
          Xác thực để xem hồ sơ
        </button>
      </div>
    );
  }

  const tabs = [
    ["ACCESS_CODE", "Mã xác thực", KeyRound],
    ["PHONE_NUMBER", "Số điện thoại", Smartphone],
    ...(otpEnabled ? ([["PHONE_OTP", "Mã OTP", MessageSquareLock]] as const) : []),
  ] as const;
  const inputCls = "mono h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-white/40";

  async function sendOtp() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await apiFetch<{ maskedPhone: string; expiresInSeconds: number }>(`/passports/${encodeURIComponent(code)}/otp`, { body: { phone } });
      setOtpSent({ maskedPhone: r.maskedPhone });
      setInfo(`Đã gửi mã OTP tới ${r.maskedPhone}. Mã có hiệu lực ${Math.round(r.expiresInSeconds / 60)} phút.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (method === "PHONE_OTP" && !otpSent) return sendOtp();
        setLoading(true);
        setError(null);
        try {
          await apiFetch(`/passports/${encodeURIComponent(code)}/verify`, { body: { method, value } });
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className={cn("grid gap-2 rounded-2xl bg-white/5 p-1 text-sm", tabs.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {tabs.map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMethod(m); setValue(""); setError(null); setInfo(null); setOtpSent(null); }}
            className={cn("flex h-10 items-center justify-center gap-1.5 rounded-xl font-semibold", method === m ? "bg-white text-[#07111f]" : "text-white/70")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {method === "PHONE_OTP" && !otpSent ? (
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="Số điện thoại đã đăng ký" className={inputCls} required minLength={8} />
      ) : (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode={method === "ACCESS_CODE" ? "text" : method === "PHONE_OTP" ? "numeric" : "tel"}
          autoCapitalize="characters"
          autoComplete={method === "PHONE_OTP" ? "one-time-code" : "off"}
          placeholder={method === "ACCESS_CODE" ? "VD: K8M4-P2X9 (in trên chứng nhận)" : method === "PHONE_OTP" ? "Mã OTP 6 số" : "Số điện thoại đã đăng ký"}
          className={inputCls}
          required
          minLength={method === "PHONE_OTP" ? 6 : 4}
          maxLength={method === "PHONE_OTP" ? 6 : undefined}
        />
      )}
      {info && <p className="text-sm text-emerald-300">{info}</p>}
      {error && <p className="text-sm font-medium text-red-300">{error}</p>}
      <button disabled={loading} className="h-12 w-full rounded-2xl font-bold text-[#07111f] disabled:opacity-60" style={{ background: gold }}>
        {loading ? "Đang xử lý…" : method === "PHONE_OTP" && !otpSent ? "Gửi mã OTP" : "Xác thực"}
      </button>
      {method === "PHONE_OTP" && otpSent && (
        <button type="button" disabled={loading} onClick={sendOtp} className="w-full text-center text-xs text-white/60 underline disabled:opacity-60">
          Gửi lại mã
        </button>
      )}
      <p className="text-[11px] text-white/40">Phiên xem hồ sơ tự hết hạn sau 30 phút. Nhập sai quá 5 lần sẽ bị tạm khóa.</p>
    </form>
  );
}
