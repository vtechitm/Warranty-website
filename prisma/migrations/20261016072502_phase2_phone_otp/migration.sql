-- CreateTable
CREATE TABLE "PatientOtpChallenge" (
    "id" UUID NOT NULL,
    "warrantyCodeId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientOtpChallenge_warrantyCodeId_createdAt_idx" ON "PatientOtpChallenge"("warrantyCodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "PatientOtpChallenge" ADD CONSTRAINT "PatientOtpChallenge_warrantyCodeId_fkey" FOREIGN KEY ("warrantyCodeId") REFERENCES "WarrantyCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
