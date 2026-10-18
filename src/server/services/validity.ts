/**
 * Warranty validity is computed, never stored, so it can't drift from the dates.
 * It is independent from the code's activation / revocation state.
 */
export type ValidityStatus = "NOT_STARTED" | "ACTIVE" | "EXPIRED" | "SUSPENDED";

/** Public lifecycle shown on the QR page. */
export type PublicState = "NOT_ACTIVATED" | "PENDING_INSTALLATION" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED";

/** Add calendar months, clamping to the last day of the target month (31 Jan + 1m = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const d = date.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target;
}

/** Warranty covers [start, end) — end date is start + duration. Last covered day is end - 1. */
export function warrantyEndDate(start: Date, durationMonths: number) {
  return addMonths(toDateOnly(start), durationMonths);
}

export function toDateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Today's date in Vietnam (UTC+7) as a date-only value. */
export function todayVN(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

export function computeValidity(
  c: { warrantyStartDate: Date | null; warrantyEndDate: Date | null; suspendedAt: Date | null } | null,
  now = new Date(),
): ValidityStatus {
  if (!c) return "NOT_STARTED";
  if (c.suspendedAt) return "SUSPENDED";
  if (!c.warrantyStartDate || !c.warrantyEndDate) return "NOT_STARTED";
  const today = todayVN(now);
  if (today < toDateOnly(c.warrantyStartDate)) return "NOT_STARTED";
  if (today >= toDateOnly(c.warrantyEndDate)) return "EXPIRED";
  return "ACTIVE";
}

export function computePublicState(
  code: { activationStatus: string; revokedAt: Date | null },
  c: { warrantyStartDate: Date | null; warrantyEndDate: Date | null; suspendedAt: Date | null } | null,
  now = new Date(),
): PublicState {
  if (code.revokedAt) return "REVOKED";
  if (code.activationStatus !== "ACTIVATED" || !c) return "NOT_ACTIVATED";
  const v = computeValidity(c, now);
  if (v === "SUSPENDED") return "SUSPENDED";
  if (v === "EXPIRED") return "EXPIRED";
  if (v === "NOT_STARTED") return c.warrantyStartDate ? "ACTIVE" : "PENDING_INSTALLATION";
  return "ACTIVE";
}

/** Lifecycle summary (CREATED / ASSIGNED / ACTIVATED / REVOKED) derived from the separate fields. */
export function lifecycleStatus(code: { assignmentStatus: string; activationStatus: string; revokedAt: Date | null }) {
  if (code.revokedAt) return "REVOKED" as const;
  if (code.activationStatus === "ACTIVATED") return "ACTIVATED" as const;
  if (code.assignmentStatus === "ASSIGNED") return "ASSIGNED" as const;
  return "CREATED" as const;
}
