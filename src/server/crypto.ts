import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** scrypt password hash: scrypt$N$r$p$salt$hash (base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, N, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Opaque random token (sessions, invitations, refresh tokens). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Keyed hash used to store tokens / access codes without storing the secret itself. */
export function hashToken(token: string) {
  return createHmac("sha256", env().HASH_PEPPER).update(token).digest("hex");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Unambiguous uppercase alphabet (no 0/O, 1/I/L, U) — 30 symbols (30^8 ≈ 6.6e11 combinations per prefix).
 * Codes are typed by hand from printed cards, so readability matters.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomString(length: number, alphabet = CODE_ALPHABET) {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

// ─────────────── Field encryption at rest (AES-256-GCM) ───────────────

function dataKey(): Buffer {
  const configured = env().DATA_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (base64)");
    return key;
  }
  if (env().NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY is required in production");
  return createHash("sha256").update(`enc:${env().AUTH_SECRET}`).digest();
}

/** Returns "v1.<iv>.<tag>.<ciphertext>" (base64url). */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  const [v, iv, tag, ct] = value.split(".");
  if (v !== "v1") throw new Error("Unknown encryption version");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Vietnamese phone normalization: +84 / 84 / 0 prefixes collapse to a leading 0. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  return d.length >= 8 ? d : null;
}

export function phoneHash(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? hashToken(`phone:${n}`) : null;
}
