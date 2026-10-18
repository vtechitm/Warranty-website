import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { actorFromBearer, actorFromWebToken, login, refreshMobileSession } from "@/server/auth/auth-service";
import { addMonths, computePublicState, computeValidity } from "@/server/services/validity";
import { decryptField, encryptField, normalizePhone } from "@/server/crypto";
import { normalizeCode } from "@/server/services/warranty-codes";
import { API_PATHS } from "@/server/openapi";
import { POST as activateRoute } from "@/app/api/v1/warranties/[code]/activate/route";
import { GET as passportRoute } from "@/app/api/v1/passports/[code]/route";
import { AppError } from "@/server/errors";
import { existsSync } from "node:fs";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("authentication", () => {
  it("web login creates a revocable session; wrong password is generic", async () => {
    await makeUser("LAB_STAFF", { email: "staff@test.local", password: "Correct-Pass-123" });
    const bad = await login({ email: "staff@test.local", password: "nope", kind: "WEB" }).catch((e) => e);
    expect(bad).toBeInstanceOf(AppError);
    expect((bad as AppError).message).toBe("Email hoặc mật khẩu không đúng");
    const ghost = await login({ email: "ghost@test.local", password: "nope", kind: "WEB" }).catch((e) => e);
    expect((ghost as AppError).message).toBe((bad as AppError).message); // no user enumeration

    const ok = await login({ email: "STAFF@test.local", password: "Correct-Pass-123", kind: "WEB" });
    if (ok.kind !== "WEB") throw new Error("expected web");
    const actor = await actorFromWebToken(ok.sessionToken);
    expect(actor?.role).toBe("LAB_STAFF");
    await prisma.deviceSession.updateMany({ data: { revokedAt: new Date() } });
    expect(await actorFromWebToken(ok.sessionToken)).toBeNull();
  });

  it("locks the account after 5 failed attempts", async () => {
    await makeUser("SUPER_ADMIN", { email: "a@test.local", password: "Correct-Pass-123" });
    for (let i = 0; i < 5; i++) await login({ email: "a@test.local", password: "bad", kind: "WEB" }).catch(() => null);
    const locked = await login({ email: "a@test.local", password: "Correct-Pass-123", kind: "WEB" }).catch((e) => e);
    expect((locked as AppError).code).toBe("RATE_LIMITED");
  });

  it("mobile refresh tokens rotate and reuse revokes the session", async () => {
    await makeUser("PATIENT", { email: "p@test.local", password: "Correct-Pass-123" });
    const r = await login({ email: "p@test.local", password: "Correct-Pass-123", kind: "MOBILE", deviceName: "iPhone" });
    if (r.kind !== "MOBILE") throw new Error("expected mobile");
    expect((await actorFromBearer(r.accessToken))?.role).toBe("PATIENT");

    const r2 = await refreshMobileSession(r.refreshToken, {});
    expect(r2.refreshToken).not.toBe(r.refreshToken);
    // Reusing the old refresh token = theft signal → whole session revoked
    await expect(refreshMobileSession(r.refreshToken, {})).rejects.toBeInstanceOf(AppError);
    await expect(refreshMobileSession(r2.refreshToken, {})).rejects.toBeInstanceOf(AppError);
    expect(await actorFromBearer(r2.accessToken)).toBeNull();
  });
});

describe("HTTP layer", () => {
  it("rejects unauthenticated activation and cross-site cookie requests", async () => {
    const params = Promise.resolve({ code: "ORG26-AAAAAAAA" });
    const unauth = await activateRoute(new NextRequest("http://localhost:3000/api/v1/warranties/ORG26-AAAAAAAA/activate", { method: "POST", body: "{}" }), { params });
    expect(unauth.status).toBe(401);

    const staff = await makeUser("LAB_STAFF", { email: "s@test.local", password: "Correct-Pass-123" });
    void staff;
    const s = await login({ email: "s@test.local", password: "Correct-Pass-123", kind: "WEB" });
    if (s.kind !== "WEB") throw new Error();
    const csrf = await activateRoute(
      new NextRequest("http://localhost:3000/api/v1/warranties/ORG26-AAAAAAAA/activate", {
        method: "POST", body: "{}", headers: { cookie: `vt_session=${s.sessionToken}`, origin: "https://evil.example", host: "localhost:3000" },
      }),
      { params },
    );
    expect(csrf.status).toBe(403);
  });

  it("public passport endpoint returns 404 JSON for unknown codes", async () => {
    const res = await passportRoute(new NextRequest("http://localhost:3000/api/v1/passports/ORG26-ZZZZZZZZ"), { params: Promise.resolve({ code: "ORG26-ZZZZZZZZ" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("every documented OpenAPI path has a route file", () => {
    for (const path of Object.keys(API_PATHS)) {
      const file = `src/app/api/v1${path.replace(/\{(\w+)\}/g, "[$1]")}/route.ts`;
      expect(existsSync(file), file).toBe(true);
    }
  });
});

describe("pure helpers", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2028-02-29T00:00:00Z"), 12).toISOString().slice(0, 10)).toBe("2029-02-28");
    expect(addMonths(new Date("2026-10-05T00:00:00Z"), 120).toISOString().slice(0, 10)).toBe("2036-10-05");
  });

  it("computes validity independently of activation", () => {
    const now = new Date("2026-10-16T05:00:00Z");
    const c = { warrantyStartDate: new Date("2026-10-01"), warrantyEndDate: new Date("2026-10-16"), suspendedAt: null };
    expect(computeValidity(c, now)).toBe("EXPIRED");
    expect(computeValidity({ ...c, warrantyEndDate: new Date("2026-10-17") }, now)).toBe("ACTIVE");
    expect(computeValidity({ ...c, suspendedAt: new Date() }, now)).toBe("SUSPENDED");
    expect(computePublicState({ activationStatus: "ACTIVATED", revokedAt: new Date() }, c, now)).toBe("REVOKED");
    expect(computePublicState({ activationStatus: "NOT_ACTIVATED", revokedAt: null }, null, now)).toBe("NOT_ACTIVATED");
  });

  it("normalizes scanned URLs and phone numbers; encrypts fields", () => {
    expect(normalizeCode("https://warranty.origin.vn/w/org26-k8m4p2x9")).toBe("ORG26-K8M4P2X9");
    expect(normalizeCode(" org26-k8m4 p2x9 ")).toBe("ORG26-K8M4P2X9");
    expect(normalizePhone("+84 901-234-567")).toBe("0901234567");
    const enc = encryptField("0901234567");
    expect(enc).not.toContain("0901");
    expect(decryptField(enc)).toBe("0901234567");
  });
});
