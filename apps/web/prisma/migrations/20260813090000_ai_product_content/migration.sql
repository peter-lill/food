CREATE TABLE "AiProviderSetting" (
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiProviderSetting_pkey" PRIMARY KEY ("provider")
);

CREATE TABLE "ProductGeneratedContent" (
    "productId" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "uses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storage" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidenceHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductGeneratedContent_pkey" PRIMARY KEY ("productId")
);

ALTER TABLE "ProductGeneratedContent" ADD CONSTRAINT "ProductGeneratedContent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
