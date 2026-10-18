import { SignJWT, jwtVerify } from "jose";
import type { SessionKind } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../errors";
import { hashPassword, hashToken, randomToken, verifyPassword } from "../crypto";
import { rateLimit } from "../rate-limit";
import { audit } from "../services/audit";
import type { Actor } from "./permissions";

export const WEB_SESSION_COOKIE = "vt_session";
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const DAY = 86_400_000;

function secretKey() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

type ClientMeta = { ip?: string | null; userAgent?: string | null; deviceName?: string | null };

export type LoginResult =
  | { kind: "WEB"; sessionToken: string; expiresAt: Date; user: PublicUser }
  | { kind: "MOBILE"; accessToken: string; accessTokenExpiresAt: Date; refreshToken: string; refreshTokenExpiresAt: Date; user: PublicUser };

export type PublicUser = { id: string; email: string; name: string; role: string; laboratoryId: string | null };

const GENERIC_LOGIN_ERROR = "Email hoặc mật khẩu không đúng";

export async function login(input: { email: string; password: string; kind: SessionKind } & ClientMeta): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  rateLimit(`login:ip:${input.ip ?? "unknown"}`, 20, 15 * 60_000);
  rateLimit(`login:email:${email}`, 10, 15 * 60_000);

  const user = await prisma.user.findUnique({ where: { email }, include: { laboratory: true } });
  if (!user || user.deletedAt) {
    await verifyPassword(input.password, null); // keep timing roughly uniform
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.");
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      },
    });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }
  if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Tài khoản chưa được kích hoạt hoặc đã bị khóa");
  if (user.laboratory && user.laboratory.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Labo đã bị tạm ngưng");

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const publicUser: PublicUser = { id: user.id, email: user.email, name: user.name, role: user.role, laboratoryId: user.laboratoryId };

  const token = randomToken();
  if (input.kind === "WEB") {
    const expiresAt = new Date(Date.now() + env().WEB_SESSION_DAYS * DAY);
    await prisma.deviceSession.create({
      data: { userId: user.id, kind: "WEB", tokenHash: hashToken(token), expiresAt, ip: input.ip, userAgent: input.userAgent?.slice(0, 300) },
    });
    await audit({ ...actorStub(user), ip: input.ip, userAgent: input.userAgent }, { action: "auth.login", entityType: "User", entityId: user.id });
    return { kind: "WEB", sessionToken: token, expiresAt, user: publicUser };
  }

  const refreshTokenExpiresAt = new Date(Date.now() + env().MOBILE_REFRESH_TOKEN_DAYS * DAY);
  const session = await prisma.deviceSession.create({
    data: {
      userId: user.id, kind: "MOBILE", tokenHash: hashToken(token), expiresAt: refreshTokenExpiresAt,
      ip: input.ip, userAgent: input.userAgent?.slice(0, 300), deviceName: input.deviceName?.slice(0, 100),
    },
  });
  const access = await issueAccessToken(user.id, session.id);
  return { kind: "MOBILE", ...access, refreshToken: token, refreshTokenExpiresAt, user: publicUser };
}

async function issueAccessToken(userId: string, sessionId: string) {
  const accessTokenExpiresAt = new Date(Date.now() + env().MOBILE_ACCESS_TOKEN_MINUTES * 60_000);
  const accessToken = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer("vtech-warranty")
    .setAudience("vtech-warranty-api")
    .setExpirationTime(accessTokenExpiresAt)
    .sign(secretKey());
  return { accessToken, accessTokenExpiresAt };
}

/**
 * Refresh-token rotation: each refresh token is single-use. Presenting an already-rotated
 * token (reuse) revokes the whole session, protecting against stolen refresh tokens.
 */
export async function refreshMobileSession(refreshToken: string, meta: ClientMeta) {
  rateLimit(`refresh:ip:${meta.ip ?? "unknown"}`, 60, 15 * 60_000);
  const hash = hashToken(refreshToken);
  const session = await prisma.deviceSession.findUnique({ where: { tokenHash: hash } });
  if (!session) {
    const reused = await prisma.deviceSession.findUnique({ where: { previousTokenHash: hash } });
    if (reused && !reused.revokedAt) {
      await prisma.deviceSession.update({ where: { id: reused.id }, data: { revokedAt: new Date() } });
      await audit(null, { action: "auth.refresh_token_reuse", entityType: "DeviceSession", entityId: reused.id });
    }
    throw new AppError("UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ");
  }
  if (session.kind !== "MOBILE" || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError("UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn");
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) throw new AppError("UNAUTHENTICATED", "Tài khoản không còn hiệu lực");

  const next = randomToken();
  const refreshTokenExpiresAt = new Date(Date.now() + env().MOBILE_REFRESH_TOKEN_DAYS * DAY);
  const updated = await prisma.deviceSession.updateMany({
    where: { id: session.id, tokenHash: hash },
    data: { tokenHash: hashToken(next), previousTokenHash: hash, expiresAt: refreshTokenExpiresAt, lastUsedAt: new Date(), ip: meta.ip },
  });
  if (updated.count !== 1) throw new AppError("UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ");
  const access = await issueAccessToken(user.id, session.id);
  return { ...access, refreshToken: next, refreshTokenExpiresAt };
}

export async function revokeSession(sessionId: string) {
  await prisma.deviceSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeWebSessionToken(token: string) {
  await prisma.deviceSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function listSessions(userId: string) {
  return prisma.deviceSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, kind: true, deviceName: true, userAgent: true, ip: true, lastUsedAt: true, createdAt: true },
    orderBy: { lastUsedAt: "desc" },
  });
}

async function actorFromSession(sessionId: string, userId: string, meta: ClientMeta): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { brands: { select: { brandId: true } }, laboratory: { select: { status: true } } },
  });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
  if (user.laboratory && user.laboratory.status !== "ACTIVE") return null;
  return {
    userId: user.id, role: user.role, name: user.name, email: user.email,
    laboratoryId: user.laboratoryId, clinicId: user.clinicId, brandIds: user.brands.map((b) => b.brandId),
    sessionId, ip: meta.ip, userAgent: meta.userAgent,
  };
}

/** Resolve the actor from a web session cookie value. */
export async function actorFromWebToken(token: string | undefined, meta: ClientMeta = {}): Promise<Actor | null> {
  if (!token) return null;
  const session = await prisma.deviceSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.kind !== "WEB" || session.revokedAt || session.expiresAt < new Date()) return null;
  // Sliding expiry, written at most once per hour.
  if (Date.now() - session.lastUsedAt.getTime() > 3_600_000) {
    await prisma.deviceSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + env().WEB_SESSION_DAYS * DAY) },
    });
  }
  return actorFromSession(session.id, session.userId, meta);
}

/** Resolve the actor from a mobile bearer access token. */
export async function actorFromBearer(token: string, meta: ClientMeta = {}): Promise<Actor | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "vtech-warranty", audience: "vtech-warranty-api" });
    const sid = payload.sid as string | undefined;
    if (!sid || !payload.sub) return null;
    const session = await prisma.deviceSession.findUnique({ where: { id: sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) return null;
    return actorFromSession(sid, payload.sub, meta);
  } catch {
    return null;
  }
}

// ─────────────── Invitations (no plaintext passwords are ever emailed) ───────────────

const INVITE_DAYS = 7;

export async function createInvitation(userId: string) {
  const token = randomToken();
  await prisma.userInvitation.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.userInvitation.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * DAY) },
  });
  return { token, path: `/invite/${token}` };
}

export async function getInvitation(token: string) {
  const inv = await prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date() || inv.user.deletedAt) return null;
  return { email: inv.user.email, name: inv.user.name };
}

export function validatePasswordStrength(password: string) {
  if (password.length < 10) throw new AppError("VALIDATION_ERROR", "Mật khẩu phải có ít nhất 10 ký tự");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError("VALIDATION_ERROR", "Mật khẩu phải gồm cả chữ và số");
  }
}

export async function acceptInvitation(token: string, password: string, meta: ClientMeta) {
  rateLimit(`invite:ip:${meta.ip ?? "unknown"}`, 20, 15 * 60_000);
  validatePasswordStrength(password);
  const inv = await prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) throw new AppError("BAD_REQUEST", "Liên kết mời không hợp lệ hoặc đã hết hạn");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const used = await tx.userInvitation.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new AppError("BAD_REQUEST", "Liên kết mời đã được sử dụng");
    await tx.user.update({ where: { id: inv.userId }, data: { passwordHash, status: inv.user.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE" } });
    await tx.deviceSession.updateMany({ where: { userId: inv.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ ...actorStub(inv.user), ip: meta.ip, userAgent: meta.userAgent }, { action: "auth.invitation_accepted", entityType: "User", entityId: inv.userId }, tx);
  });
  return { email: inv.user.email };
}

export async function changePassword(actor: Actor, currentPassword: string, newPassword: string) {
  validatePasswordStrength(newPassword);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new AppError("BAD_REQUEST", "Mật khẩu hiện tại không đúng");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.deviceSession.updateMany({ where: { userId: user.id, revokedAt: null, NOT: { id: actor.sessionId } }, data: { revokedAt: new Date() } });
  await audit(actor, { action: "auth.password_changed", entityType: "User", entityId: user.id });
}

function actorStub(user: { id: string; role: Actor["role"]; name: string; email: string; laboratoryId: string | null; clinicId: string | null }): Actor {
  return { userId: user.id, role: user.role, name: user.name, email: user.email, laboratoryId: user.laboratoryId, clinicId: user.clinicId, brandIds: [], sessionId: "" };
}
