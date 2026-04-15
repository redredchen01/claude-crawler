# Phase 9 Unit A: User & Team Models

**Status:** Planning  
**Target Duration:** 1.5 weeks  
**Execution Approach:** Schema-first, test-driven  
**Base:** Phase 8 complete (v1.0.0 on main)

---

## Goal

Extend Prisma schema to support multi-user teams and organization-level quotas. No breaking changes to existing User/ApiKey models. Fully backward compatible.

---

## Schema Changes

### 1. Add Team Model

```prisma
model Team {
  id String @id @default(cuid())
  name String
  slug String @unique
  orgId String? // Parent organization (future)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  members TeamMember[]
  quotas TeamQuota[]
  webhooks WebhookConfig[]
  
  @@index([slug])
  @@index([createdAt])
}
```

### 2. Add TeamMember Model

```prisma
model TeamMember {
  id String @id @default(cuid())
  teamId String
  userId String
  role "admin" | "editor" | "viewer"
  joinedAt DateTime @default(now())
  
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([teamId, userId])
  @@index([teamId])
  @@index([userId])
}
```

### 3. Add TeamQuota Model

```prisma
model TeamQuota {
  id String @id @default(cuid())
  teamId String @unique
  monthlyLimit Int // e.g., 100000 requests/month
  currentUsage Int @default(0)
  resetAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  
  @@index([teamId])
  @@index([resetAt])
}
```

### 4. Extend User Model

```prisma
extend User {
  teams TeamMember[]
  defaultTeamId String? // Primary team context
}
```

### 5. Extend ApiKey Model

```prisma
extend ApiKey {
  teamId String? // NULL = personal key, otherwise team key
  ipWhitelist String? // "192.168.1.1,10.0.0.0/8" or null (any IP)
  endpoints String[] // ["score", "optimize-full"] or [] (all)
  readonly Boolean @default(false) // Can't call /api/teams or /api/keys
  expiresAt DateTime? // Auto-revoke after date
  
  @@index([teamId])
  @@index([expiresAt])
}
```

---

## Implementation Steps

### Step 1: Write Migration Tests (Test-First)

**File:** `__tests__/lib/migrations.test.ts` (NEW)

```typescript
describe("Migration: Add Teams Schema", () => {
  test("applies cleanly on fresh SQLite database", async () => {
    // Create temp in-memory database
    // Run migration
    // Verify: Team table exists
    // Verify: TeamMember table exists with FK constraints
    // Verify: TeamQuota table exists
    // Verify: User.teams relation created
    // Verify: ApiKey fields added
  });

  test("migrates existing users without data loss", async () => {
    // Setup: Existing User and ApiKey records
    // Run migration
    // Verify: User count unchanged
    // Verify: ApiKey count unchanged
    // Verify: New fields are nullable (backward compat)
  });

  test("cascading deletes work correctly", async () => {
    // Setup: Team → TeamMembers → User
    // Delete Team
    // Verify: All TeamMembers deleted
    // Verify: User records remain
  });

  test("unique constraints prevent duplicates", async () => {
    // Setup: Team with slug "acme"
    // Try to create another Team with slug "acme"
    // Verify: Constraint error (unique violation)
  });

  test("indexes are created for query performance", async () => {
    // Verify: INDEX on Team.slug
    // Verify: INDEX on TeamMember(teamId, userId)
    // Verify: INDEX on TeamQuota.resetAt
  });
});
```

### Step 2: Create Prisma Migration

**File:** `prisma/migrations/20260414_add_teams/migration.sql` (NEW)

SQLite version:
```sql
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
    CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
    UNIQUE("teamId", "userId")
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

-- Extend User
ALTER TABLE "User" ADD COLUMN "defaultTeamId" TEXT;

-- Extend ApiKey
ALTER TABLE "ApiKey" ADD COLUMN "teamId" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "ipWhitelist" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "endpoints" TEXT; -- JSON array: '["score","optimize-full"]'
ALTER TABLE "ApiKey" ADD COLUMN "readonly" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" DATETIME;

-- CreateIndex
CREATE INDEX "Team_slug_idx" ON "Team"("slug");
CREATE INDEX "Team_createdAt_idx" ON "Team"("createdAt");
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX "TeamQuota_teamId_idx" ON "TeamQuota"("teamId");
CREATE INDEX "TeamQuota_resetAt_idx" ON "TeamQuota"("resetAt");
CREATE INDEX "ApiKey_teamId_idx" ON "ApiKey"("teamId");
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");
```

### Step 3: Update Prisma Schema

**File:** `prisma/schema.prisma` (MODIFY)

1. Add Team model (see schema section above)
2. Add TeamMember model
3. Add TeamQuota model
4. Extend User model with `teams` relation and `defaultTeamId`
5. Extend ApiKey model with team-related fields

### Step 4: Create Service Layer

**File:** `lib/teams.ts` (NEW, ~200 LOC)

```typescript
export async function createTeam(userId: string, name: string, slug: string): Promise<Team> {
  // Validate slug (alphanumeric, dash, underscore only)
  // Create team
  // Add creator as admin member
  // Initialize quota with monthly limit from env (default 100,000)
  // Return team
}

export async function getTeamById(teamId: string, userId: string): Promise<Team | null> {
  // Verify user is member of team
  // Return team with members and quotas
}

export async function listUserTeams(userId: string): Promise<Team[]> {
  // Return all teams user is member of, ordered by joined date
}

export async function addTeamMember(teamId: string, requestingUserId: string, targetUserId: string, role: Role): Promise<TeamMember> {
  // Verify requester is admin of team
  // Check if user already member
  // Add member with given role
  // Log audit event
}

export async function removeTeamMember(teamId: string, requestingUserId: string, targetUserId: string): Promise<void> {
  // Verify requester is admin
  // Prevent self-removal (must have another admin)
  // Delete membership
}

export async function updateTeamQuota(teamId: string, userId: string, newLimit: number): Promise<TeamQuota> {
  // Verify user is admin
  // Update monthly limit
  // Reset currentUsage
  // Set resetAt to next month
}

export async function incrementTeamQuotaUsage(teamId: string, amount: number): Promise<void> {
  // Increment currentUsage by amount
  // Check if exceeded (log warning if > 90%)
}

export async function getTeamQuota(teamId: string): Promise<TeamQuota> {
  // Return current usage and limit
  // Check if reset window expired (monthly)
}
```

### Step 5: Write Service Tests

**File:** `__tests__/lib/teams.test.ts` (NEW, ~300 LOC)

```typescript
describe("Team Service", () => {
  describe("createTeam", () => {
    test("creates team and adds creator as admin", async () => {
      const team = await createTeam("user123", "Acme Corp", "acme");
      expect(team.name).toBe("Acme Corp");
      expect(team.slug).toBe("acme");
      
      const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe("user123");
      expect(members[0].role).toBe("admin");
    });

    test("rejects duplicate slug", async () => {
      await createTeam("user1", "Team 1", "acme");
      await expect(createTeam("user2", "Team 2", "acme")).rejects.toThrow();
    });

    test("initializes team quota with env default", async () => {
      process.env.TEAM_QUOTA_DEFAULT = "50000";
      const team = await createTeam("user123", "Test", "test");
      
      const quota = await prisma.teamQuota.findUnique({ where: { teamId: team.id } });
      expect(quota?.monthlyLimit).toBe(50000);
    });
  });

  describe("Team Member Management", () => {
    test("admin can add members", async () => {
      const team = await createTeam("admin", "Test", "test");
      await addTeamMember(team.id, "admin", "user2", "editor");
      
      const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
      expect(members).toHaveLength(2);
    });

    test("non-admin cannot add members", async () => {
      const team = await createTeam("admin", "Test", "test");
      await addTeamMember(team.id, "admin", "user2", "viewer");
      
      await expect(addTeamMember(team.id, "user2", "user3", "editor"))
        .rejects.toThrow("Not authorized");
    });

    test("cannot remove last admin", async () => {
      const team = await createTeam("admin", "Test", "test");
      
      await expect(removeTeamMember(team.id, "admin", "admin"))
        .rejects.toThrow("Cannot remove last admin");
    });
  });

  describe("Team Quota Management", () => {
    test("tracks usage correctly", async () => {
      const team = await createTeam("user1", "Test", "test");
      
      await incrementTeamQuotaUsage(team.id, 100);
      let quota = await getTeamQuota(team.id);
      expect(quota.currentUsage).toBe(100);
      
      await incrementTeamQuotaUsage(team.id, 50);
      quota = await getTeamQuota(team.id);
      expect(quota.currentUsage).toBe(150);
    });

    test("resets usage monthly", async () => {
      const team = await createTeam("user1", "Test", "test");
      const quota = await prisma.teamQuota.findUnique({ where: { teamId: team.id } });
      
      // Set resetAt to past
      await prisma.teamQuota.update({
        where: { teamId: team.id },
        data: { resetAt: new Date(Date.now() - 1000), currentUsage: 100 }
      });
      
      // getTeamQuota should reset if window expired
      const refreshed = await getTeamQuota(team.id);
      expect(refreshed.currentUsage).toBe(0);
      expect(refreshed.resetAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
```

### Step 6: Verify All Tests Pass

```bash
npm run test:ci
```

**Target:** 200+ tests passing (existing 190 + 10+ new unit tests)

---

## Execution Checklist

- [ ] Write migration tests (TDD)
- [ ] Create `prisma/migrations/20260414_add_teams/migration.sql`
- [ ] Update `prisma/schema.prisma` with new models
- [ ] Run `prisma migrate dev` to apply locally
- [ ] Create `lib/teams.ts` service layer
- [ ] Write `__tests__/lib/teams.test.ts` (all tests green)
- [ ] Verify migration works on fresh SQLite + PostgreSQL
- [ ] Verify backward compatibility (existing records untouched)
- [ ] Commit: "feat: Phase 9 Unit A - User & Team Models"
- [ ] Push to origin/feat/phase9-unit-a branch

---

## Verification Criteria

| Criterion | Expected |
|-----------|----------|
| **Schema applies cleanly** | ✅ Migration runs on SQLite + PostgreSQL |
| **Backward compat** | ✅ Existing Users/ApiKeys unchanged |
| **FK constraints** | ✅ Cascading deletes work, unique indexes enforced |
| **Service layer tests** | ✅ 12+ tests, all green |
| **No breaking changes** | ✅ Phase 8 tests still pass (190+) |
| **Total tests** | ✅ 200+ passing |

---

## Deferred Decisions

**To resolve during implementation:**
1. Should User have a `currentTeamId` (selected team context) or always specify `teamId` in API calls?
   - **Approach:** defaultTeamId for context, explicit teamId in endpoints

2. Should old ApiKeys (teamId=NULL) be automatically migrated to a "personal" team?
   - **Decision:** No, NULL remains personal. Migration in Phase 9.2.

3. Quota granularity: per-endpoint (score vs optimize-full) or combined?
   - **Decision:** Combined monthly quota for Phase 9.0, per-endpoint in Phase 9.2+

---

## Dependencies

- **Prisma:** Already installed
- **SQLite:** Already configured (dev)
- **PostgreSQL:** Connection string (for prod testing, optional)

---

## Time Estimate

| Task | Duration |
|------|----------|
| Write migration tests | 2 hours |
| Create migration SQL | 1 hour |
| Update Prisma schema | 1 hour |
| Create service layer | 3 hours |
| Write service tests | 3 hours |
| Integration verification | 2 hours |
| **Total** | **~12 hours (1.5 work days)** |

---

**Prepared by:** Claude Code  
**Date:** April 14, 2026  
**Status:** Ready to start implementation
