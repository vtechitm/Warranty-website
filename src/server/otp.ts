import { env } from "./env";

/**
 * Delivery channel for patient one-time codes. Implementations must not log the code in production.
 * Add a provider by implementing `OtpProvider` and wiring it in `otpProvider()`.
 */
export interface OtpProvider {
  readonly name: string;
  /** `phone` is normalized to the Vietnamese leading-0 form (e.g. 0901234567). */
  send(phone: string, code: string, ctx: { ttlMinutes: number; brandName: string }): Promise<void>;
}

/** Development provider: prints the code to the server console and keeps the last messages in memory (tests). */
export class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";
  readonly outbox: { phone: string; code: string; at: Date }[] = [];
  async send(phone: string, code: string, ctx: { ttlMinutes: number; brandName: string }) {
    this.outbox.push({ phone, code, at: new Date() });
    if (this.outbox.length > 50) this.outbox.shift();
    if (env().NODE_ENV !== "test") console.info(`[otp:console] ${ctx.brandName} → ${phone}: ${code} (hết hạn sau ${ctx.ttlMinutes} phút)`);
  }
}

/**
 * Zalo ZNS (Zalo Notification Service) — stub. Needs an approved OTP template and an OA access token.
 * TODO: POST https://business.openapi.zalo.me/message/template with
 *   { phone: "84…", template_id: ZALO_ZNS_TEMPLATE_ID, template_data: { otp: code }, tracking_id }
 *   header access_token: ZALO_ZNS_ACCESS_TOKEN (refresh via the OA refresh-token flow).
 */
export class ZaloZnsOtpProvider implements OtpProvider {
  readonly name = "zalo";
  constructor(private cfg: { accessToken?: string; templateId?: string }) {}
  async send(): Promise<void> {
    if (!this.cfg.accessToken || !this.cfg.templateId) throw new Error("Zalo ZNS OTP provider is not configured (ZALO_ZNS_ACCESS_TOKEN, ZALO_ZNS_TEMPLATE_ID)");
    throw new Error("Zalo ZNS OTP provider is not implemented yet");
  }
}

/**
 * SMS brandname gateway (eSMS, SpeedSMS, Viettel, …) — stub. Message template must be registered with the carrier, e.g.
 * "{BRAND}: Ma xac thuc ho so bao hanh cua ban la {CODE}. Hieu luc {TTL} phut. Khong chia se ma nay."
 */
export class SmsOtpProvider implements OtpProvider {
  readonly name = "sms";
  constructor(private cfg: { apiUrl?: string; apiKey?: string; brandname?: string }) {}
  async send(): Promise<void> {
    if (!this.cfg.apiUrl || !this.cfg.apiKey || !this.cfg.brandname) throw new Error("SMS OTP provider is not configured (SMS_API_URL, SMS_API_KEY, SMS_BRANDNAME)");
    throw new Error("SMS OTP provider is not implemented yet");
  }
}

let instance: OtpProvider | null | undefined;

/** The configured provider, or null when phone OTP is unavailable (disabled, or console in production). */
export function otpProvider(): OtpProvider | null {
  if (instance !== undefined) return instance;
  const e = env();
  switch (e.OTP_PROVIDER) {
    case "console":
      instance = e.NODE_ENV === "production" ? null : new ConsoleOtpProvider();
      break;
    case "zalo":
      instance = new ZaloZnsOtpProvider({ accessToken: e.ZALO_ZNS_ACCESS_TOKEN, templateId: e.ZALO_ZNS_TEMPLATE_ID });
      break;
    case "sms":
      instance = new SmsOtpProvider({ apiUrl: e.SMS_API_URL, apiKey: e.SMS_API_KEY, brandname: e.SMS_BRANDNAME });
      break;
    default:
      instance = null;
  }
  return instance;
}

/** Test hook. */
export function setOtpProvider(p: OtpProvider | null | undefined) {
  instance = p;
}
