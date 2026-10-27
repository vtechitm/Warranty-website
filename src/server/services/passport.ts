import { SignJWT, jwtVerify } from "jose";
import { prisma } from "../db";
import { env } from "../env";
import { AppError, conflict, notFound } from "../errors";
import { randomInt, randomUUID } from "node:crypto";
import { decryptField, hashToken, normalizePhone, safeEqualHex } from "../crypto";
import { otpProvider } from "../otp";
import { rateLimit } from "../rate-limit";
import { assertCan, type Actor } from "../auth/permissions";
import { audit } from "./audit";
import { hashAccessCode, type PolicySnapshot } from "./activation";
import { CODE_PATTERN, normalizeCode } from "./warranty-codes";
import { computePublicState, computeValidity, type PublicState } from "./validity";
import { warrantyUrl } from "./qr";
import { parseLanding } from "../landing-schema";

/** Max failed verification attempts per code in the window (persisted in DB). */
const VERIFY_MAX_FAILURES = 5;
const VERIFY_WINDOW_MS = 30 * 60_000;
export const PATIENT_ACCESS_COOKIE = "vt_pa";
const PATIENT_ACCESS_MINUTES = 30;
/** Phone OTP: code lifetime, attempts per code, resend cooldown and max sends per code per window. */
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_SENDS = 3;
const OTP_SEND_WINDOW_MS = 15 * 60_000;

export type PublicBrand = {
  id: string; name: string; slug: string; tagline: string | null; logoUrl: string | null;
  primaryColor: string; secondaryColor: string; accentColor: string;
  supportPhone: string | null; supportEmail: string | null; supportUrl: string | null; websiteUrl: string | null;
};

/** Privacy-safe view for anyone holding the QR URL. Never contains patient or lab-inventory data. */
export type PublicPassport = {
  code: string;
  url: string;
  state: PublicState;
  brand: PublicBrand;
  product: { name: string; materialType: string | null; origin: string | null; description: string | null; imageUrl: string | null };
  activatedAt: string | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  /** Warranty duration provided by the activating laboratory (null until activated). */
  durationMonths: number | null;
  validity: ReturnType<typeof computeValidity> | null;
  unitCount: number | null;
  authorizedLaboratory: string | null;
  policy: Pick<PolicySnapshot, "conditions" | "exclusions" | "claimInstructions" | "careInstructions" | "benefits" | "version"> | null;
  revokedAt: string | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function publicBrand(b: PublicBrand & Record<string, unknown>): PublicBrand {
  return {
    id: b.id, name: b.name, slug: b.slug, tagline: b.tagline, logoUrl: b.logoUrl ?? parseLanding(b.landingConfig).hero.logoUrl,
    primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, accentColor: b.accentColor,
    supportPhone: b.supportPhone, supportEmail: b.supportEmail, supportUrl: b.supportUrl, websiteUrl: b.websiteUrl,
  };
}

export async function getPublicPassport(rawCode: string, ip?: string | null): Promise<PublicPassport | null> {
  rateLimit(`public:lookup:${ip ?? "unknown"}`, 120, 60_000);
  const code = normalizeCode(rawCode);
  if (!CODE_PATTERN.test(code)) return null; // cheap rejection of enumeration noise
  const wc = await prisma.warrantyCode.findUnique({
    where: { code },
    include: {
      brand: true,
      product: true,
      batch: { select: { qrBaseUrl: true } },
      case: { select: { warrantyStartDate: true, warrantyEndDate: true, suspendedAt: true, unitCount: true, policySnapshot: true, laboratory: { select: { name: true } } } },
    },
  });
  if (!wc) return null;
  const c = wc.case;
  const state = computePublicState(wc, c);
  const activated = wc.activationStatus === "ACTIVATED" && !!c && !wc.revokedAt;
  const snap = c ? (c.policySnapshot as unknown as PolicySnapshot) : null;
  // Before activation only Vtech's product information (care instructions) is shown — the warranty is the lab's to set.
  const currentPolicy = !snap
    ? await prisma.warrantyPolicy.findFirst({ where: { productId: wc.productId, isCurrent: true }, select: { careInstructions: true } })
    : null;
  return {
    code: wc.code,
    url: warrantyUrl(wc.batch.qrBaseUrl, wc.code),
    state,
    brand: publicBrand(wc.brand),
    product: { name: wc.product.name, materialType: wc.product.materialType, origin: wc.product.origin, description: wc.product.description, imageUrl: wc.product.imageUrl },
    activatedAt: activated ? iso(wc.activatedAt) : null,
    warrantyStartDate: activated ? iso(c!.warrantyStartDate) : null,
    warrantyEndDate: activated || state === "EXPIRED" ? iso(c?.warrantyEndDate) : null,
    durationMonths: snap?.durationMonths ?? null,
    validity: activated ? computeValidity(c) : null,
    unitCount: activated ? c!.unitCount : null,
    authorizedLaboratory: activated ? c!.laboratory.name : null,
    policy: snap
      ? { conditions: snap.conditions, exclusions: snap.exclusions, claimInstructions: snap.claimInstructions, careInstructions: snap.careInstructions, benefits: snap.benefits, version: snap.version }
      : currentPolicy
        ? { conditions: null, exclusions: null, claimInstructions: null, careInstructions: currentPolicy.careInstructions, benefits: null, version: 0 }
        : null,
    revokedAt: iso(wc.revokedAt),
  };
}

// ─────────────── Patient verification ───────────────

function key() {
  return new TextEncoder().encode(`${env().AUTH_SECRET}:patient-access`);
}

export type PatientVerifyMethod = "ACCESS_CODE" | "PHONE_NUMBER" | "PHONE_OTP";

const otpHash = (challengeId: string, otp: string) => hashToken(`otp:${challengeId}:${otp}`);
const maskPhone = (p: string) => `${"•".repeat(Math.max(0, p.length - 3))}${p.slice(-3)}`;

export function phoneOtpEnabled() {
  return otpProvider() !== null;
}

/**
 * Sends a one-time code to the phone registered at activation. The caller must type that phone number
 * (a mismatch counts as a failed verification), so the QR alone cannot be used to spam the patient.
 * Limits: shared per-code failure lockout, 3 sends / 15 min and 60 s cooldown per code (persisted), 10 / hour per IP.
 */
export async function requestPatientOtp(rawCode: string, phone: string, ip?: string | null) {
  const provider = otpProvider();
  if (!provider) throw new AppError("BAD_REQUEST", "Xác thực bằng mã OTP chưa được bật. Vui lòng dùng mã xác thực trên chứng nhận.", undefined, "OTP_UNAVAILABLE");
  rateLimit(`public:otp:ip:${ip ?? "unknown"}`, 10, 60 * 60_000);
  const code = normalizeCode(rawCode);
  const wc = await prisma.warrantyCode.findUnique({ where: { code }, include: { brand: { select: { name: true } }, case: { include: { patient: true } } } });
  if (!wc || !wc.case || wc.revokedAt) throw notFound("Không tìm thấy chứng nhận đã kích hoạt");
  const failures = await prisma.patientAccessVerification.count({
    where: { warrantyCodeId: wc.id, success: false, createdAt: { gte: new Date(Date.now() - VERIFY_WINDOW_MS) } },
  });
  if (failures >= VERIFY_MAX_FAILURES) throw new AppError("RATE_LIMITED", "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 30 phút.");

  const recent = await prisma.patientOtpChallenge.findMany({
    where: { warrantyCodeId: wc.id, createdAt: { gte: new Date(Date.now() - OTP_SEND_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const sinceLast = recent[0] ? (Date.now() - recent[0].createdAt.getTime()) / 1000 : Infinity;
  if (sinceLast < OTP_RESEND_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_SECONDS - sinceLast);
    throw new AppError("RATE_LIMITED", `Vui lòng đợi ${wait} giây trước khi gửi lại mã.`, { retryAfterSeconds: wait });
  }
  if (recent.length >= OTP_MAX_SENDS) throw new AppError("RATE_LIMITED", "Đã gửi quá nhiều mã OTP. Vui lòng thử lại sau 15 phút.", { retryAfterSeconds: Math.ceil(OTP_SEND_WINDOW_MS / 1000) });

  const stored = normalizePhone(decryptField(wc.case.patient.phoneEnc));
  if (!stored) throw new AppError("BAD_REQUEST", "Hồ sơ chưa đăng ký số điện thoại. Vui lòng dùng mã xác thực trên chứng nhận.", undefined, "NO_PHONE_ON_RECORD");
  const given = normalizePhone(phone);
  if (!given || given !== stored) {
    await prisma.patientAccessVerification.create({ data: { warrantyCodeId: wc.id, method: "PHONE_OTP", success: false, ip: ip ?? null } });
    throw new AppError("BAD_REQUEST", "Số điện thoại không khớp với hồ sơ", { remainingAttempts: VERIFY_MAX_FAILURES - failures - 1 });
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomUUID();
  const now = new Date();
  // A new code replaces any earlier unused one.
  await prisma.patientOtpChallenge.updateMany({ where: { warrantyCodeId: wc.id, consumedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  await prisma.patientOtpChallenge.create({
    data: { id, warrantyCodeId: wc.id, codeHash: otpHash(id, otp), provider: provider.name, expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000), ip: ip ?? null },
  });
  try {
    await provider.send(stored, otp, { ttlMinutes: OTP_TTL_MINUTES, brandName: wc.brand.name });
  } catch (e) {
    console.error("[otp] delivery failed", provider.name, e);
    await prisma.patientOtpChallenge.update({ where: { id }, data: { expiresAt: new Date() } });
    throw new AppError("INTERNAL", "Không gửi được mã OTP. Vui lòng thử lại sau hoặc dùng mã xác thực trên chứng nhận.", undefined, "OTP_DELIVERY_FAILED");
  }
  return { sent: true, maskedPhone: maskPhone(stored), expiresInSeconds: OTP_TTL_MINUTES * 60, resendAfterSeconds: OTP_RESEND_SECONDS };
}

/** Checks a submitted OTP against the latest live challenge (single use, attempt limited). */
async function checkOtp(warrantyCodeId: string, value: string) {
  const challenge = await prisma.patientOtpChallenge.findFirst({
    where: { warrantyCodeId, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new AppError("BAD_REQUEST", "Mã OTP đã hết hạn hoặc chưa được gửi. Vui lòng gửi lại mã.", undefined, "OTP_EXPIRED");
  const bumped = await prisma.patientOtpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (bumped.count === 0) {
    await prisma.patientOtpChallenge.update({ where: { id: challenge.id }, data: { expiresAt: new Date() } });
    throw new AppError("BAD_REQUEST", "Mã OTP đã hết lượt nhập. Vui lòng gửi lại mã.", undefined, "OTP_EXPIRED");
  }
  if (!/^\d{6}$/.test(value) || !safeEqualHex(otpHash(challenge.id, value), challenge.codeHash)) return false;
  // Single use: only one concurrent request can consume the challenge.
  const consumed = await prisma.patientOtpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return consumed.count === 1;
}

/**
 * Verifies the bearer of the card is the patient: the access code printed on the certificate,
 * the full phone number recorded at activation, or a one-time code sent to that phone (PHONE_OTP).
 * Attempts are rate limited per code (persisted) and per IP, and every attempt is recorded.
 */
export async function verifyPatientAccess(rawCode: string, method: PatientVerifyMethod, value: string, ip?: string | null) {
  rateLimit(`public:verify:ip:${ip ?? "unknown"}`, 20, 60 * 60_000);
  const code = normalizeCode(rawCode);
  const wc = await prisma.warrantyCode.findUnique({ where: { code }, include: { case: { include: { patient: true } } } });
  if (!wc || !wc.case || wc.revokedAt) throw notFound("Không tìm thấy chứng nhận đã kích hoạt");
  const failures = await prisma.patientAccessVerification.count({
    where: { warrantyCodeId: wc.id, success: false, createdAt: { gte: new Date(Date.now() - VERIFY_WINDOW_MS) } },
  });
  if (failures >= VERIFY_MAX_FAILURES) throw new AppError("RATE_LIMITED", "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 30 phút.");

  let ok = false;
  if (method === "ACCESS_CODE") {
    ok = safeEqualHex(hashAccessCode(value), wc.case.accessCodeHash);
  } else if (method === "PHONE_OTP") {
    ok = await checkOtp(wc.id, value.trim());
  } else {
    const stored = normalizePhone(decryptField(wc.case.patient.phoneEnc));
    const given = normalizePhone(value);
    ok = !!stored && !!given && stored === given;
  }
  await prisma.patientAccessVerification.create({ data: { warrantyCodeId: wc.id, method, success: ok, ip: ip ?? null } });
  const wrong = { ACCESS_CODE: "Mã xác thực không đúng", PHONE_NUMBER: "Số điện thoại không khớp với hồ sơ", PHONE_OTP: "Mã OTP không đúng" }[method];
  if (!ok) throw new AppError("BAD_REQUEST", wrong, { remainingAttempts: VERIFY_MAX_FAILURES - failures - 1 });

  const token = await new SignJWT({ code: wc.code })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PATIENT_ACCESS_MINUTES}m`)
    .sign(key());
  return { token, expiresInSeconds: PATIENT_ACCESS_MINUTES * 60 };
}

export async function readPatientAccessToken(token: string | undefined, code: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.code === normalizeCode(code);
  } catch {
    return false;
  }
}

/** The warranty code a patient access token was issued for, or null if the token is missing / invalid. */
export async function patientCodeFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return typeof payload.code === "string" ? payload.code : null;
  } catch {
    return null;
  }
}

/** Private section shown only after verification (or to a linked patient account). */
export async function getPrivatePassport(code: string) {
  const wc = await prisma.warrantyCode.findUnique({
    where: { code: normalizeCode(code) },
    include: { case: { include: { patient: true, units: { orderBy: { toothNumber: "asc" } } } } },
  });
  if (!wc?.case || wc.revokedAt) throw notFound();
  const c = wc.case;
  return {
    patientName: c.patient.fullName,
    clinicName: c.clinicName,
    dentistName: c.dentistName,
    restorationType: c.restorationType,
    teeth: c.units.map((u) => ({ toothNumber: u.toothNumber, restorationType: u.restorationType, shade: u.shade })),
    completionDate: iso(c.completionDate),
    installationDate: iso(c.installationDate),
    installationStatus: c.installationStatus,
  };
}
export type PrivatePassport = Awaited<ReturnType<typeof getPrivatePassport>>;

// ─────────────── Patient accounts (mobile-ready) ───────────────

/** Links a case to a patient account. Requires the access code (possession proof), never name/phone matching alone. */
export async function linkWarrantyToPatient(actor: Actor, rawCode: string, accessCode: string) {
  assertCan(actor, "patient-portal");
  const account = await prisma.patientAccount.findUnique({ where: { userId: actor.userId } });
  if (!account) throw notFound("Chưa có hồ sơ bệnh nhân");
  await verifyPatientAccess(rawCode, "ACCESS_CODE", accessCode, actor.ip);
  const wc = await prisma.warrantyCode.findUniqueOrThrow({ where: { code: normalizeCode(rawCode) }, include: { case: true } });
  const existing = await prisma.patientWarrantyLink.findFirst({ where: { restorationCaseId: wc.case!.id } });
  if (existing && existing.patientAccountId !== account.id) throw conflict("Chứng nhận đã được liên kết với tài khoản khác. Vui lòng liên hệ Vtech.");
  const link = await prisma.patientWarrantyLink.upsert({
    where: { patientAccountId_restorationCaseId: { patientAccountId: account.id, restorationCaseId: wc.case!.id } },
    create: { patientAccountId: account.id, restorationCaseId: wc.case!.id, method: "ACCESS_CODE" },
    update: {},
  });
  await audit(actor, { action: "patient.link_warranty", entityType: "RestorationCase", entityId: wc.case!.id, metadata: { code: wc.code } });
  return link;
}

export async function listPatientWarranties(actor: Actor) {
  assertCan(actor, "patient-portal");
  const account = await prisma.patientAccount.findUnique({
    where: { userId: actor.userId },
    include: { links: { include: { restorationCase: { include: { warrantyCode: true, product: true, units: true } } } } },
  });
  if (!account) return [];
  return account.links.map((l) => {
    const c = l.restorationCase;
    return {
      code: c.warrantyCode.code,
      product: c.product.name,
      state: computePublicState(c.warrantyCode, c),
      validity: computeValidity(c),
      warrantyEndDate: iso(c.warrantyEndDate),
      teeth: c.units.map((u) => u.toothNumber).sort((a, b) => a - b),
      linkedAt: l.verifiedAt.toISOString(),
    };
  });
}
