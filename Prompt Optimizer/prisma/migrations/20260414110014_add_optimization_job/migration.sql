-- CreateTable OptimizationJob
CREATE TABLE "OptimizationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cancelledAt" DATETIME,
    CONSTRAINT "OptimizationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX "OptimizationJob_userId_idx" ON "OptimizationJob"("userId");

-- CreateIndex
CREATE INDEX "OptimizationJob_status_idx" ON "OptimizationJob"("status");

-- CreateIndex
CREATE INDEX "OptimizationJob_createdAt_idx" ON "OptimizationJob"("createdAt");
