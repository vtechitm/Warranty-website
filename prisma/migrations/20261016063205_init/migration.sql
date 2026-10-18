-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BRAND_ADMIN', 'LAB_ADMIN', 'LAB_STAFF', 'CLINIC_USER', 'PATIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "LaboratoryStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "ActivationStatus" AS ENUM ('NOT_ACTIVATED', 'ACTIVATED');

-- CreateEnum
CREATE TYPE "WarrantyStartRule" AS ENUM ('INSTALLATION_DATE', 'ACTIVATION_DATE', 'COMPLETION_DATE');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('CONFIRMED', 'PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClaimantType" AS ENUM ('PATIENT', 'CLINIC', 'LABORATORY');

-- CreateEnum
CREATE TYPE "PatientLinkMethod" AS ENUM ('ACCESS_CODE', 'PHONE_OTP', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('ACCESS_CODE', 'PHONE_NUMBER', 'PHONE_OTP');

-- CreateEnum
CREATE TYPE "CertificateLayout" AS ENUM ('CLASSIC', 'PREMIUM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "laboratoryId" UUID,
    "clinicId" UUID,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBrand" (
    "userId" UUID NOT NULL,
    "brandId" UUID NOT NULL,

    CONSTRAINT "UserBrand_pkey" PRIMARY KEY ("userId","brandId")
);

-- CreateTable
CREATE TABLE "UserInvitation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "zaloEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "warrantyReminders" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0B1F3A',
    "secondaryColor" TEXT NOT NULL DEFAULT '#C9A96E',
    "accentColor" TEXT NOT NULL DEFAULT '#F5F5F7',
    "supportPhone" TEXT,
    "supportEmail" TEXT,
    "supportUrl" TEXT,
    "websiteUrl" TEXT,
    "landingConfig" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandDomain" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verificationToken" TEXT NOT NULL,
    "redirectToPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "materialType" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyPolicy" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "startRule" "WarrantyStartRule" NOT NULL DEFAULT 'INSTALLATION_DATE',
    "conditions" TEXT,
    "exclusions" TEXT,
    "claimInstructions" TEXT,
    "careInstructions" TEXT,
    "benefits" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLot" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "manufacturedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" UUID NOT NULL,
    "brandId" UUID,
    "name" TEXT NOT NULL,
    "layout" "CertificateLayout" NOT NULL DEFAULT 'PREMIUM',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Laboratory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxCode" TEXT,
    "status" "LaboratoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Laboratory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaboratoryBrand" (
    "laboratoryId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaboratoryBrand_pkey" PRIMARY KEY ("laboratoryId","brandId")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyBatch" (
    "id" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "brandId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "qrBaseUrl" TEXT NOT NULL,
    "notes" TEXT,
    "error" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WarrantyBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "brandId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "serial" INTEGER NOT NULL,
    "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "activationStatus" "ActivationStatus" NOT NULL DEFAULT 'NOT_ACTIVATED',
    "assignedLaboratoryId" UUID,
    "assignedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyAssignment" (
    "id" UUID NOT NULL,
    "warrantyCodeId" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "assignedById" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "WarrantyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneEnc" TEXT,
    "phoneHash" TEXT,
    "birthYear" INTEGER,
    "externalRef" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "phoneNormalized" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientWarrantyLink" (
    "id" UUID NOT NULL,
    "patientAccountId" UUID NOT NULL,
    "restorationCaseId" UUID NOT NULL,
    "method" "PatientLinkMethod" NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientWarrantyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationCase" (
    "id" UUID NOT NULL,
    "warrantyCodeId" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicId" UUID,
    "brandId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "clinicName" TEXT,
    "dentistName" TEXT,
    "clinicPhone" TEXT,
    "restorationType" TEXT NOT NULL,
    "unitCount" INTEGER NOT NULL,
    "completionDate" DATE,
    "installationDate" DATE,
    "installationStatus" "InstallationStatus" NOT NULL,
    "warrantyStartDate" DATE,
    "warrantyEndDate" DATE,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "notes" TEXT,
    "policyId" UUID NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "accessCodeHash" TEXT NOT NULL,
    "accessCodeEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationUnit" (
    "id" UUID NOT NULL,
    "restorationCaseId" UUID NOT NULL,
    "toothNumber" INTEGER NOT NULL,
    "restorationType" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "materialLotId" UUID,
    "shade" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestorationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyActivation" (
    "id" UUID NOT NULL,
    "warrantyCodeId" UUID NOT NULL,
    "restorationCaseId" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "activatedById" UUID NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAccessVerification" (
    "id" UUID NOT NULL,
    "warrantyCodeId" UUID NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAccessVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" UUID NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "warrantyCodeId" UUID NOT NULL,
    "restorationCaseId" UUID NOT NULL,
    "claimantType" "ClaimantType" NOT NULL,
    "claimantName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "description" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaimEvent" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "fromStatus" "ClaimStatus",
    "toStatus" "ClaimStatus" NOT NULL,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "laboratoryId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_laboratoryId_idx" ON "User"("laboratoryId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_tokenHash_key" ON "DeviceSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_previousTokenHash_key" ON "DeviceSession"("previousTokenHash");

-- CreateIndex
CREATE INDEX "DeviceSession_userId_idx" ON "DeviceSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_codePrefix_key" ON "Brand"("codePrefix");

-- CreateIndex
CREATE UNIQUE INDEX "BrandDomain_hostname_key" ON "BrandDomain"("hostname");

-- CreateIndex
CREATE INDEX "BrandDomain_brandId_idx" ON "BrandDomain"("brandId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brandId_sku_key" ON "Product"("brandId", "sku");

-- CreateIndex
CREATE INDEX "WarrantyPolicy_productId_isCurrent_idx" ON "WarrantyPolicy"("productId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyPolicy_productId_version_key" ON "WarrantyPolicy"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialLot_productId_lotNumber_key" ON "MaterialLot"("productId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Laboratory_code_key" ON "Laboratory"("code");

-- CreateIndex
CREATE INDEX "Clinic_laboratoryId_name_idx" ON "Clinic"("laboratoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyBatch_batchNumber_key" ON "WarrantyBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "WarrantyBatch_brandId_createdAt_idx" ON "WarrantyBatch"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "WarrantyBatch_productId_idx" ON "WarrantyBatch"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyCode_code_key" ON "WarrantyCode"("code");

-- CreateIndex
CREATE INDEX "WarrantyCode_assignedLaboratoryId_activationStatus_idx" ON "WarrantyCode"("assignedLaboratoryId", "activationStatus");

-- CreateIndex
CREATE INDEX "WarrantyCode_brandId_activationStatus_idx" ON "WarrantyCode"("brandId", "activationStatus");

-- CreateIndex
CREATE INDEX "WarrantyCode_productId_idx" ON "WarrantyCode"("productId");

-- CreateIndex
CREATE INDEX "WarrantyCode_activatedAt_idx" ON "WarrantyCode"("activatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyCode_batchId_serial_key" ON "WarrantyCode"("batchId", "serial");

-- CreateIndex
CREATE INDEX "WarrantyAssignment_warrantyCodeId_idx" ON "WarrantyAssignment"("warrantyCodeId");

-- CreateIndex
CREATE INDEX "WarrantyAssignment_laboratoryId_assignedAt_idx" ON "WarrantyAssignment"("laboratoryId", "assignedAt");

-- CreateIndex
CREATE INDEX "Patient_laboratoryId_fullName_idx" ON "Patient"("laboratoryId", "fullName");

-- CreateIndex
CREATE INDEX "Patient_phoneHash_idx" ON "Patient"("phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccount_userId_key" ON "PatientAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientWarrantyLink_patientAccountId_restorationCaseId_key" ON "PatientWarrantyLink"("patientAccountId", "restorationCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "RestorationCase_warrantyCodeId_key" ON "RestorationCase"("warrantyCodeId");

-- CreateIndex
CREATE INDEX "RestorationCase_laboratoryId_createdAt_idx" ON "RestorationCase"("laboratoryId", "createdAt");

-- CreateIndex
CREATE INDEX "RestorationCase_clinicId_idx" ON "RestorationCase"("clinicId");

-- CreateIndex
CREATE INDEX "RestorationCase_warrantyEndDate_idx" ON "RestorationCase"("warrantyEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestorationUnit_restorationCaseId_toothNumber_key" ON "RestorationUnit"("restorationCaseId", "toothNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyActivation_warrantyCodeId_key" ON "WarrantyActivation"("warrantyCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyActivation_restorationCaseId_key" ON "WarrantyActivation"("restorationCaseId");

-- CreateIndex
CREATE INDEX "WarrantyActivation_laboratoryId_activatedAt_idx" ON "WarrantyActivation"("laboratoryId", "activatedAt");

-- CreateIndex
CREATE INDEX "WarrantyActivation_activatedAt_idx" ON "WarrantyActivation"("activatedAt");

-- CreateIndex
CREATE INDEX "PatientAccessVerification_warrantyCodeId_createdAt_idx" ON "PatientAccessVerification"("warrantyCodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_claimNumber_key" ON "WarrantyClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "WarrantyClaim_status_createdAt_idx" ON "WarrantyClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WarrantyClaim_warrantyCodeId_idx" ON "WarrantyClaim"("warrantyCodeId");

-- CreateIndex
CREATE INDEX "WarrantyClaimEvent_claimId_createdAt_idx" ON "WarrantyClaimEvent"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBrand" ADD CONSTRAINT "UserBrand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBrand" ADD CONSTRAINT "UserBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandDomain" ADD CONSTRAINT "BrandDomain_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyPolicy" ADD CONSTRAINT "WarrantyPolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaboratoryBrand" ADD CONSTRAINT "LaboratoryBrand_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaboratoryBrand" ADD CONSTRAINT "LaboratoryBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyBatch" ADD CONSTRAINT "WarrantyBatch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyBatch" ADD CONSTRAINT "WarrantyBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyBatch" ADD CONSTRAINT "WarrantyBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCode" ADD CONSTRAINT "WarrantyCode_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCode" ADD CONSTRAINT "WarrantyCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCode" ADD CONSTRAINT "WarrantyCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WarrantyBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCode" ADD CONSTRAINT "WarrantyCode_assignedLaboratoryId_fkey" FOREIGN KEY ("assignedLaboratoryId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyAssignment" ADD CONSTRAINT "WarrantyAssignment_warrantyCodeId_fkey" FOREIGN KEY ("warrantyCodeId") REFERENCES "WarrantyCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyAssignment" ADD CONSTRAINT "WarrantyAssignment_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccount" ADD CONSTRAINT "PatientAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWarrantyLink" ADD CONSTRAINT "PatientWarrantyLink_patientAccountId_fkey" FOREIGN KEY ("patientAccountId") REFERENCES "PatientAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWarrantyLink" ADD CONSTRAINT "PatientWarrantyLink_restorationCaseId_fkey" FOREIGN KEY ("restorationCaseId") REFERENCES "RestorationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationCase" ADD CONSTRAINT "RestorationCase_warrantyCodeId_fkey" FOREIGN KEY ("warrantyCodeId") REFERENCES "WarrantyCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationCase" ADD CONSTRAINT "RestorationCase_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationCase" ADD CONSTRAINT "RestorationCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationCase" ADD CONSTRAINT "RestorationCase_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationCase" ADD CONSTRAINT "RestorationCase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationCase" ADD CONSTRAINT "RestorationCase_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "WarrantyPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationUnit" ADD CONSTRAINT "RestorationUnit_restorationCaseId_fkey" FOREIGN KEY ("restorationCaseId") REFERENCES "RestorationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationUnit" ADD CONSTRAINT "RestorationUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationUnit" ADD CONSTRAINT "RestorationUnit_materialLotId_fkey" FOREIGN KEY ("materialLotId") REFERENCES "MaterialLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyActivation" ADD CONSTRAINT "WarrantyActivation_warrantyCodeId_fkey" FOREIGN KEY ("warrantyCodeId") REFERENCES "WarrantyCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyActivation" ADD CONSTRAINT "WarrantyActivation_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyActivation" ADD CONSTRAINT "WarrantyActivation_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccessVerification" ADD CONSTRAINT "PatientAccessVerification_warrantyCodeId_fkey" FOREIGN KEY ("warrantyCodeId") REFERENCES "WarrantyCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_warrantyCodeId_fkey" FOREIGN KEY ("warrantyCodeId") REFERENCES "WarrantyCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_restorationCaseId_fkey" FOREIGN KEY ("restorationCaseId") REFERENCES "RestorationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaimEvent" ADD CONSTRAINT "WarrantyClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "WarrantyClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
