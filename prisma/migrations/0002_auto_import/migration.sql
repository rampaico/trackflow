-- CreateTable: EmailImportAddress
CREATE TABLE IF NOT EXISTS "EmailImportAddress" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailImportAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DriveConnection
CREATE TABLE IF NOT EXISTS "DriveConnection" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "folderPath" TEXT NOT NULL,
    "folderName" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "lastImportAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ImportJobSource
CREATE TABLE IF NOT EXISTS "ImportJobSource" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJobSource_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailImportAddress_shop_key" ON "EmailImportAddress"("shop");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailImportAddress_token_key" ON "EmailImportAddress"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailImportAddress_email_key" ON "EmailImportAddress"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "ImportJobSource_jobId_key" ON "ImportJobSource"("jobId");

-- CreateIndex for DriveConnection
CREATE INDEX IF NOT EXISTS "DriveConnection_shop_idx" ON "DriveConnection"("shop");
