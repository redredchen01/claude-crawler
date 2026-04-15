-- CreateTable Team
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Team" ("id") ON DELETE SET NULL
);

-- CreateTable TeamMember
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE,
    CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- CreateTable TeamQuota
CREATE TABLE "TeamQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL UNIQUE,
    "monthlyLimit" INTEGER NOT NULL DEFAULT 100000,
    "currentUsage" INTEGER NOT NULL DEFAULT 0,
    "resetAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamQuota_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE
);

-- Extend User table
ALTER TABLE "User" ADD COLUMN "defaultTeamId" TEXT;

-- Extend ApiKey table
ALTER TABLE "ApiKey" ADD COLUMN "teamId" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "ipWhitelist" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "endpoints" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "readonly" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" DATETIME;

-- CreateIndex
CREATE INDEX "Team_slug_idx" ON "Team"("slug");
CREATE INDEX "Team_createdAt_idx" ON "Team"("createdAt");
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX "TeamQuota_teamId_idx" ON "TeamQuota"("teamId");
CREATE INDEX "TeamQuota_resetAt_idx" ON "TeamQuota"("resetAt");
CREATE INDEX "ApiKey_teamId_idx" ON "ApiKey"("teamId");
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");
