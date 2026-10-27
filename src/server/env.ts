import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  TRUSTED_ORIGINS: z.string().default(""),
  AUTH_SECRET: z.string().min(16),
  HASH_PEPPER: z.string().min(6),
  /** 32-byte key (base64) for field encryption at rest. Falls back to a key derived from AUTH_SECRET. */
  DATA_ENCRYPTION_KEY: z.string().optional(),
  WEB_SESSION_DAYS: z.coerce.number().int().positive().default(7),
  MOBILE_ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(15),
  MOBILE_REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(60),

  /** Public IPv4 of this server, shown in the brand-domain DNS instructions (A record). */
  PUBLIC_SERVER_IP: z.string().ip({ version: "v4" }).optional(),

  /** Object storage for uploads (claim photos): local disk in dev, any S3-compatible service in prod. */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** true for MinIO and most self-hosted services (endpoint/bucket/key); false = virtual-hosted (bucket.endpoint/key). */
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  CLAIM_IMAGE_MAX_MB: z.coerce.number().positive().max(50).default(8),
  CLAIM_IMAGE_MAX_COUNT: z.coerce.number().int().min(1).max(20).default(6),

  /** Phone OTP delivery for patient verification. `console` logs the code (dev only; disabled in production). */
  OTP_PROVIDER: z.enum(["console", "zalo", "sms", "disabled"]).default("console"),
  ZALO_ZNS_ACCESS_TOKEN: z.string().optional(),
  ZALO_ZNS_TEMPLATE_ID: z.string().optional(),
  SMS_API_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_BRANDNAME: z.string().optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) {
    // Docker Compose passes `${VAR:-}` as an empty string; treat empty as "not set" so optional values validate.
    const parsed = schema.safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")));
    if (!parsed.success) {
      throw new Error("Invalid environment configuration: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
    }
    if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_SECRET.startsWith("change-me")) {
      throw new Error("AUTH_SECRET must be set to a strong random value in production");
    }
    cached = parsed.data;
  }
  return cached;
}

export function appUrl() {
  return env().APP_URL.replace(/\/+$/, "");
}
