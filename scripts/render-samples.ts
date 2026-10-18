/**
 * Dev utility: renders a certificate and a label sheet for design review.
 *   npx tsx --env-file=.env scripts/render-samples.ts <outDir> <warrantyCode>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/server/db";
import { certificatePdf } from "../src/server/services/certificates";
import { exportBatchLabels } from "../src/server/services/exports";
import type { Actor } from "../src/server/auth/permissions";

async function main() {
  const [outDir = "samples", code] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const wc = await prisma.warrantyCode.findUniqueOrThrow({ where: { code }, include: { case: true } });
  const labUser = await prisma.user.findFirstOrThrow({ where: { laboratoryId: wc.case!.laboratoryId } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const actor = (u: typeof admin): Actor => ({ userId: u.id, role: u.role, name: u.name, email: u.email, laboratoryId: u.laboratoryId, clinicId: null, brandIds: [], sessionId: "script" });

  const full = await certificatePdf(code, { actor: actor(labUser) });
  writeFileSync(path.join(outDir, "certificate-full.pdf"), full.pdf);
  const pub = await certificatePdf(code, {});
  writeFileSync(path.join(outDir, "certificate-public.pdf"), pub.pdf);
  for (const template of ["a4-3x8", "a4-2x5-card"] as const) {
    const labels = await exportBatchLabels(actor(admin), wc.batchId, template, { serialFrom: 1, serialTo: 24 }, true);
    writeFileSync(path.join(outDir, `labels-${template}.pdf`), labels.buffer);
  }
  console.log("written to", outDir);
}

main().finally(() => prisma.$disconnect());
