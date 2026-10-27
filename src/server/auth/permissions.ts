import type { Role } from "@prisma/client";
import { forbidden } from "../errors";

/**
 * Permission matrix. Every protected operation checks one of these on the server.
 * Scope (which lab / which brand) is enforced separately inside services.
 */
export const PERMISSIONS = {
  "brand:read": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "brand:manage": ["SUPER_ADMIN"],
  /** Edit the public brand page content (own brands for brand admins). */
  "brand:content": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "product:read": ["SUPER_ADMIN", "BRAND_ADMIN", "LAB_ADMIN", "LAB_STAFF"],
  "product:manage": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "policy:manage": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "laboratory:read": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "laboratory:manage": ["SUPER_ADMIN"],
  "lab-staff:manage": ["SUPER_ADMIN", "LAB_ADMIN"],
  "batch:read": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "batch:generate": ["SUPER_ADMIN"],
  "code:assign": ["SUPER_ADMIN"],
  "code:revoke": ["SUPER_ADMIN"],
  "code:read-all": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "code:read-lab": ["LAB_ADMIN", "LAB_STAFF"],
  "warranty:activate": ["LAB_ADMIN", "LAB_STAFF"],
  "warranty:correct": ["SUPER_ADMIN", "LAB_ADMIN"],
  "warranty:suspend": ["SUPER_ADMIN"],
  "patient:read": ["SUPER_ADMIN", "LAB_ADMIN", "LAB_STAFF"],
  "patient:search": ["SUPER_ADMIN", "LAB_ADMIN"],
  "claim:submit": ["SUPER_ADMIN", "LAB_ADMIN", "LAB_STAFF", "CLINIC_USER", "PATIENT"],
  "claim:manage": ["SUPER_ADMIN"],
  "report:export": ["SUPER_ADMIN", "BRAND_ADMIN"],
  "user:manage": ["SUPER_ADMIN"],
  "audit:read": ["SUPER_ADMIN"],
  "patient-portal": ["PATIENT"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission) {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export type Actor = {
  userId: string;
  role: Role;
  name: string;
  email: string;
  laboratoryId: string | null;
  clinicId: string | null;
  brandIds: string[];
  sessionId: string;
  ip?: string | null;
  userAgent?: string | null;
};

export function assertCan(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw forbidden();
}

/** Lab users must belong to a laboratory; returns it or throws. */
export function requireLab(actor: Actor): string {
  if (!actor.laboratoryId || (actor.role !== "LAB_ADMIN" && actor.role !== "LAB_STAFF")) throw forbidden();
  return actor.laboratoryId;
}

/** Brand filter for queries: undefined = all brands (super admin). */
export function brandScope(actor: Actor): string[] | undefined {
  if (actor.role === "SUPER_ADMIN") return undefined;
  if (actor.role === "BRAND_ADMIN") return actor.brandIds;
  return [];
}

export function assertBrandAccess(actor: Actor, brandId: string) {
  const scope = brandScope(actor);
  if (scope && !scope.includes(brandId)) throw forbidden();
}
