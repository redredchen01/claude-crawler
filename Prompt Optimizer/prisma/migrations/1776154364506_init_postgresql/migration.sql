-- PostgreSQL Schema Migration
-- Generated: 2026-04-14T08:12:44.506Z
-- This is the initial schema for PostgreSQL deployment

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE "User" (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    "defaultTeamId" TEXT,
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_deletionRequestedAt_idx" ON "User"("deletionRequestedAt");

-- Teams table
CREATE TABLE "Team" (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Team_userId_idx" ON "Team"("userId");

-- TeamMember table
CREATE TABLE "TeamMember" (
    id TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- TeamQuota table
CREATE TABLE "TeamQuota" (
    id TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL UNIQUE REFERENCES "Team"(id) ON DELETE CASCADE,
    "maxOptimizeTokensPerMonth" INTEGER NOT NULL DEFAULT 1000000,
    "maxScoreTokensPerMonth" INTEGER NOT NULL DEFAULT 500000,
    "usedOptimizeTokensThisMonth" INTEGER NOT NULL DEFAULT 0,
    "usedScoreTokensThisMonth" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- OptimizationRecord table
CREATE TABLE "OptimizationRecord" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "teamId" TEXT REFERENCES "Team"(id) ON DELETE SET NULL,
    "input" TEXT NOT NULL,
    "optimized" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "tokensUsed" INTEGER,
    "processingTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OptimizationRecord_userId_createdAt_idx" ON "OptimizationRecord"("userId", "createdAt" DESC);
CREATE INDEX "OptimizationRecord_teamId_idx" ON "OptimizationRecord"("teamId");

-- ApiKey table
CREATE TABLE "ApiKey" (
    id TEXT NOT NULL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "teamId" TEXT REFERENCES "Team"(id) ON DELETE SET NULL,
    "ipWhitelist" TEXT,
    endpoints TEXT,
    readonly BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");
CREATE INDEX "ApiKey_teamId_idx" ON "ApiKey"("teamId");
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");

-- WebhookConfig table
CREATE TABLE "WebhookConfig" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "teamId" TEXT REFERENCES "Team"(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'all',
    active BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "WebhookConfig_userId_idx" ON "WebhookConfig"("userId");
CREATE INDEX "WebhookConfig_teamId_idx" ON "WebhookConfig"("teamId");

-- WebhookEvent table
CREATE TABLE "WebhookEvent" (
    id TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL REFERENCES "WebhookConfig"(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3)
);

CREATE INDEX "WebhookEvent_webhookId_status_idx" ON "WebhookEvent"("webhookId", "status");

-- OptimizationJob table
CREATE TABLE "OptimizationJob" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "prompt" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    error TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OptimizationJob_userId_status_idx" ON "OptimizationJob"("userId", "status");

-- BatchOptimizationJob table
CREATE TABLE "BatchOptimizationJob" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    prompts TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    results TEXT,
    error TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "BatchOptimizationJob_userId_status_idx" ON "BatchOptimizationJob"("userId", "status");

-- Session table
CREATE TABLE "Session" (
    id TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    expires TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AuditLog table
CREATE TABLE "AuditLog" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    error TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- UserPreference table
CREATE TABLE "UserPreference" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
    "compositionStrategy" TEXT NOT NULL DEFAULT 'balanced',
    "compositionHierarchy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stripe billing table
CREATE TABLE "StripeBilling" (
    id TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
    "stripeCustomerId" TEXT UNIQUE,
    "stripeSubscriptionId" TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "StripeBilling_stripeCustomerId_idx" ON "StripeBilling"("stripeCustomerId");

-- Create migration metadata table
CREATE TABLE "_prisma_migrations" (
    id VARCHAR(36) PRIMARY KEY,
    checksum VARCHAR(64) NOT NULL,
    finished_at TIMESTAMP WITHOUT TIME ZONE,
    migration_name VARCHAR(255) NOT NULL,
    logs TEXT,
    rolled_back_at TIMESTAMP WITHOUT TIME ZONE,
    started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_steps_count INTEGER NOT NULL DEFAULT 0
);
