import { prisma } from "../db";
import { notFound } from "../errors";
import type { Actor } from "../auth/permissions";
import { renderCertificatePdf, type CertificateData } from "../pdf/certificate";
import { getWarrantyDetail } from "./activation";
import { getPrivatePassport, getPublicPassport } from "./passport";

/**
 * Builds certificate data.
 * - actor (lab/admin): full record incl. patient access code (to hand to the patient)
 * - verifiedPatient: patient-facing record without the access code re-print
 * - neither: privacy-safe public certificate
 */
export async function buildCertificateData(code: string, viewer: { actor?: Actor | null; verifiedPatient?: boolean; ip?: string | null }): Promise<CertificateData> {
  const pub = await getPublicPassport(code, viewer.ip);
  if (!pub) throw notFound("Mã bảo hành không tồn tại");
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: pub.brand.id } });
  const base: CertificateData = {
    code: pub.code,
    url: pub.url,
    state: pub.state,
    brand: { name: brand.name, primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor, supportPhone: brand.supportPhone, supportEmail: brand.supportEmail, websiteUrl: brand.websiteUrl },
    productName: pub.product.name,
    materialType: pub.product.materialType,
    origin: pub.product.origin,
    activatedAt: pub.activatedAt,
    warrantyStartDate: pub.warrantyStartDate,
    warrantyEndDate: pub.warrantyEndDate,
    durationMonths: pub.durationMonths,
    unitCount: pub.unitCount,
    laboratoryName: pub.authorizedLaboratory,
    conditions: pub.policy?.conditions,
    exclusions: pub.policy?.exclusions,
    careInstructions: pub.policy?.careInstructions,
    policyVersion: pub.policy?.version || null,
  };
  if (viewer.actor && pub.state !== "NOT_ACTIVATED" && pub.state !== "REVOKED") {
    const d = await getWarrantyDetail(viewer.actor, code);
    if (d.case?.patient) {
      base.private = {
        patientName: d.case.patient.fullName,
        clinicName: d.case.clinicName,
        dentistName: d.case.dentistName,
        restorationType: d.case.restorationType,
        teeth: d.case.units.map((u) => u.toothNumber),
        installationDate: d.case.installationDate,
        accessCode: d.case.accessCode,
      };
    }
  } else if (viewer.verifiedPatient && pub.state !== "NOT_ACTIVATED" && pub.state !== "REVOKED") {
    const p = await getPrivatePassport(code);
    base.private = {
      patientName: p.patientName, clinicName: p.clinicName, dentistName: p.dentistName, restorationType: p.restorationType,
      teeth: p.teeth.map((t) => t.toothNumber), installationDate: p.installationDate,
    };
  }
  return base;
}

export async function certificatePdf(code: string, viewer: { actor?: Actor | null; verifiedPatient?: boolean; ip?: string | null }) {
  const data = await buildCertificateData(code, viewer);
  return { data, pdf: await renderCertificatePdf(data) };
}
