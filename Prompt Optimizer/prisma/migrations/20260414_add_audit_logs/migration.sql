-- Add deletion request tracking to User
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" DATETIME;

-- Create AuditLog table
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "teamId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "changes" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'success',
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "AuditLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL
);

-- Create indexes for AuditLog
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_teamId_idx" ON "AuditLog"("teamId");
CREATE INDEX "AuditLog_resourceType_idx" ON "AuditLog"("resourceType");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- Create index for User.deletionRequestedAt
CREATE INDEX "User_deletionRequestedAt_idx" ON "User"("deletionRequestedAt");
