// Creates (or re-invites) a SUPER_ADMIN and prints a one-time invitation link.
// Plain ESM so it runs inside the production image without a TypeScript toolchain:
//   ADMIN_EMAIL=you@vtechdental.vn ADMIN_NAME="Vtech Admin" node scripts/create-admin.mjs
import { createHmac, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || "Vtech Admin";
const pepper = process.env.HASH_PEPPER;
if (!email || !pepper) {
  console.error("ADMIN_EMAIL and HASH_PEPPER are required");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({ data: { email, name, role: "SUPER_ADMIN", status: "INVITED" } }));
  if (user.role !== "SUPER_ADMIN") throw new Error(`${email} exists with role ${user.role}`);

  // Same token scheme as src/server/auth/auth-service.ts (HMAC-SHA256 with HASH_PEPPER).
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHmac("sha256", pepper).update(token).digest("hex");
  await prisma.userInvitation.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.userInvitation.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
  await prisma.auditLog.create({ data: { action: "user.bootstrap_admin", entityType: "User", entityId: user.id, metadata: { email } } });

  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  console.log(`Invitation for ${email} (valid 7 days, single use):\n${base}/invite/${token}`);
} finally {
  await prisma.$disconnect();
}
