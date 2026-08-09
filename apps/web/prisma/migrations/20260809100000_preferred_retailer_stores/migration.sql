CREATE TABLE "PreferredRetailerStore" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "retailer" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "postcode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "isPreferred" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PreferredRetailerStore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreferredRetailerStore_userId_retailer_storeId_key"
  ON "PreferredRetailerStore"("userId", "retailer", "storeId");
CREATE INDEX "PreferredRetailerStore_userId_retailer_isPreferred_idx"
  ON "PreferredRetailerStore"("userId", "retailer", "isPreferred");

ALTER TABLE "PreferredRetailerStore"
  ADD CONSTRAINT "PreferredRetailerStore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "RetailerPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "retailer" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetailerPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RetailerPreference_userId_retailer_key" ON "RetailerPreference"("userId", "retailer");
CREATE INDEX "RetailerPreference_userId_enabled_idx" ON "RetailerPreference"("userId", "enabled");
ALTER TABLE "RetailerPreference" ADD CONSTRAINT "RetailerPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
