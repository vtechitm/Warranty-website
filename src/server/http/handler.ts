import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors";
import { actorFromBearer, actorFromWebToken, WEB_SESSION_COOKIE } from "../auth/auth-service";
import { assertCan, type Actor, type Permission } from "../auth/permissions";
import { env } from "../env";

export const API_VERSION = "1";

type Ctx<P> = {
  req: NextRequest;
  params: P;
  actor: Actor | null;
  ip: string | null;
  userAgent: string | null;
  body<S extends ZodTypeAny>(schema: S): Promise<z.infer<S>>;
  query<S extends ZodTypeAny>(schema: S): z.infer<S>;
  /** multipart/form-data body (file uploads). */
  form(): Promise<FormData>;
};

type AuthedCtx<P> = Omit<Ctx<P>, "actor"> & { actor: Actor };

type Options = { auth?: "required" | "optional" | "none"; permission?: Permission };

export function clientIp(headers: Headers) {
  // The reverse proxy (docker/Caddyfile) overwrites X-Real-IP with the socket peer address, so it
  // cannot be spoofed by clients. X-Forwarded-For is only a fallback for other proxy setups.
  return headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** CSRF defense for cookie-authenticated requests: Origin must be our own host or a trusted origin. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) throw new AppError("FORBIDDEN", "Thiếu Origin header");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const trusted = env().TRUSTED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN", "Origin không hợp lệ");
  }
  if (originHost !== host && !trusted.includes(origin)) throw new AppError("FORBIDDEN", "Yêu cầu bị chặn (CSRF)");
}

export async function resolveActor(req: NextRequest): Promise<{ actor: Actor | null; viaCookie: boolean }> {
  const meta = { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") };
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return { actor: await actorFromBearer(authz.slice(7), meta), viaCookie: false };
  const cookie = req.cookies.get(WEB_SESSION_COOKIE)?.value;
  return { actor: cookie ? await actorFromWebToken(cookie, meta) : null, viaCookie: !!cookie };
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    const headers: Record<string, string> = { "API-Version": API_VERSION };
    const d = e.details as { retryAfterSeconds?: number } | undefined;
    if (e.code === "RATE_LIMITED" && d?.retryAfterSeconds) headers["Retry-After"] = String(d.retryAfterSeconds);
    return NextResponse.json({ error: { code: e.code, reason: e.reason, message: e.message, details: e.details } }, { status: e.status, headers });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: !e.issues[0]
            ? "Dữ liệu không hợp lệ"
            : e.issues[0].message === "Required"
              ? `Thiếu trường bắt buộc: ${e.issues[0].path.join(".")}`
              : e.issues[0].message,
          details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422, headers: { "API-Version": API_VERSION } },
    );
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy dữ liệu" } }, { status: 404 });
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Lỗi hệ thống, vui lòng thử lại" } }, { status: 500 });
}

export function api<P = Record<string, string>>(opts: Options & { auth: "required" }, handler: (ctx: AuthedCtx<P>) => Promise<unknown>): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;
export function api<P = Record<string, string>>(opts: Options, handler: (ctx: Ctx<P>) => Promise<unknown>): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function api<P>(opts: Options, handler: (ctx: any) => Promise<unknown>) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }) => {
    try {
      const authMode = opts.auth ?? "required";
      let actor: Actor | null = null;
      if (authMode !== "none") {
        const resolved = await resolveActor(req);
        actor = resolved.actor;
        if (authMode === "required" && !actor) throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập");
        if (resolved.viaCookie && !SAFE_METHODS.has(req.method)) assertSameOrigin(req);
        if (opts.permission && actor) assertCan(actor, opts.permission);
      }
      const ctx: Ctx<P> = {
        req,
        params: (await routeCtx?.params) ?? ({} as P),
        actor,
        ip: clientIp(req.headers),
        userAgent: req.headers.get("user-agent"),
        async body(schema) {
          let json: unknown;
          try {
            json = await req.json();
          } catch {
            throw new AppError("BAD_REQUEST", "Body phải là JSON hợp lệ");
          }
          return schema.parse(json);
        },
        query(schema) {
          return schema.parse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== "")));
        },
        async form() {
          if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
            throw new AppError("BAD_REQUEST", "Body phải là multipart/form-data");
          }
          try {
            return await req.formData();
          } catch {
            throw new AppError("BAD_REQUEST", "Không đọc được dữ liệu tải lên");
          }
        },
      };
      const result = await handler(ctx);
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null }, { headers: { "API-Version": API_VERSION, "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export function fileResponse(buffer: Buffer | Uint8Array, filename: string, contentType: string, inline = false) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
