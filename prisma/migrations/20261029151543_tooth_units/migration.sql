-- CreateEnum
CREATE TYPE "UnitEntryKind" AS ENUM ('ALLOCATION', 'ACTIVATION', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "UnitBalance" (
    "laboratoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitBalance_pkey" PRIMARY KEY ("laboratoryId","productId")
);

-- CreateTable
CREATE TABLE "UnitLedgerEntry" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "kind" "UnitEntryKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "restorationCaseId" UUID,
    "reference" TEXT,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitLedgerEntry_laboratoryId_productId_createdAt_idx" ON "UnitLedgerEntry"("laboratoryId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "UnitLedgerEntry_restorationCaseId_idx" ON "UnitLedgerEntry"("restorationCaseId");

-- CreateIndex
CREATE INDEX "UnitLedgerEntry_createdAt_idx" ON "UnitLedgerEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "UnitBalance" ADD CONSTRAINT "UnitBalance_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitBalance" ADD CONSTRAINT "UnitBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitLedgerEntry" ADD CONSTRAINT "UnitLedgerEntry_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitLedgerEntry" ADD CONSTRAINT "UnitLedgerEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A balance can never go negative (second guard behind the conditional UPDATE in the activation transaction).
ALTER TABLE "UnitBalance" ADD CONSTRAINT "UnitBalance_balance_nonnegative" CHECK ("balance" >= 0);
