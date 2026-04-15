# Phase 9 Roadmap — User & Team Management

**Status:** Planning  
**Target Timeline:** Phase 9 (2026 Q2-Q3)  
**Foundation:** v1.0 complete (Phase 8), enterprise features ready for extension

---

## Vision

Phase 9 extends Prompt Optimizer from per-user rate limiting to **organization-scale quota management** with team support, usage analytics, billing integration, and advanced access controls. This enables:

- Teams to pool quotas and manage member permissions
- Fine-grained usage analytics (per user, per endpoint, per team)
- Self-serve billing with Stripe integration
- Audit trails for compliance and cost allocation
- Advanced API key scoping (read-only, limited endpoints, IP whitelisting)

---

## High-Level Goals

| Goal | Impact | Dependencies |
|------|--------|--------------|
| **Team Quotas** | Orgs can allocate shared quotas to teams | User model refactor |
| **Usage Export** | CSV/JSON exports for cost allocation | PostgreSQL FTS index |
| **Billing Integration** | Pay-as-you-go via Stripe, usage tiers | Payment provider account |
| **Audit Trails** | Log all API calls, key rotations, team changes | Event logging service |
| **Advanced Scoping** | IP whitelist, endpoint restrictions, read-only keys | API key model extension |

---

## Phase 9 Units (Estimated 6-8 weeks)

### Unit A: User & Team Models (1.5 weeks)

**Goal:** Extend Prisma schema to support multi-user teams and org-level quotas.

**Files:**
- `prisma/schema.prisma` (modify)
- `prisma/migrations/20260501_add_teams/` (new)

**Changes:**
1. Add `Team` model:
   ```prisma
   model Team {
     id String @id @default(cuid())
     name String
     slug String @unique
     orgId String? // Parent organization
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt
     members TeamMember[]
     quotas TeamQuota[]
     webhooks WebhookConfig[] // Org-level webhooks
   }
   ```

2. Add `TeamMember` model with roles (admin, editor, viewer):
   ```prisma
   model TeamMember {
     id String @id @default(cuid())
     teamId String
     userId String
     role "admin" | "editor" | "viewer"
     createdAt DateTime @default(now())
   }
   ```

3. Add `TeamQuota` model:
   ```prisma
   model TeamQuota {
     id String @id @default(cuid())
     teamId String
     monthlyLimit Int // e.g., 100000 requests/month
     currentUsage Int
     resetAt DateTime
   }
   ```

4. Extend `ApiKey` model:
   ```prisma
   extend ApiKey {
     teamId String? // NULL = personal key
     ipWhitelist String? // Comma-separated IPs
     endpoints String[] // ["score", "optimize-full", "history"]
     readonly Boolean @default(false)
   }
   ```

5. Extend `User` model:
   ```prisma
   extend User {
     teams TeamMember[]
     defaultTeamId String? // Primary team context
   }
   ```

**Execution note:** Test-first. Write migration tests before schema changes.

**Verification:**
- Migration applies cleanly on both SQLite and PostgreSQL
- No existing users/keys broken
- Can create team → invite member → assign quota → issue scoped key
- All 158+ existing tests still pass

---

### Unit B: Team Management API (1.5 weeks)

**Goal:** Create endpoints for team CRUD, member management, and quota allocation.

**Files:**
- `app/api/teams/route.ts` (new)
- `app/api/teams/[id]/route.ts` (new)
- `app/api/teams/[id]/members/route.ts` (new)
- `app/api/teams/[id]/quotas/route.ts` (new)
- `lib/teams.ts` (new)

**Endpoints:**

1. **Team Management**
   - `POST /api/teams` — Create team
   - `GET /api/teams` — List teams (user member of)
   - `GET /api/teams/:id` — Get team details
   - `PATCH /api/teams/:id` — Update team (admin only)
   - `DELETE /api/teams/:id` — Delete team (admin only, cascade delete)

2. **Team Members**
   - `GET /api/teams/:id/members` — List members
   - `POST /api/teams/:id/members` — Invite member (email)
   - `PATCH /api/teams/:id/members/:userId` — Change role (admin only)
   - `DELETE /api/teams/:id/members/:userId` — Remove member (admin only)

3. **Team Quotas**
   - `GET /api/teams/:id/quotas` — View current quota/usage
   - `PATCH /api/teams/:id/quotas` — Set monthly limit (admin only)

**Authorization:** Role-based access control (RBAC):
- Admin: All team operations
- Editor: View team, submit requests (quota-limited)
- Viewer: View-only (no API calls)

**Verification:**
- Create team → invite 2 members → assign roles → run request as each role
- Verify editor can't change quota, viewer can't submit requests
- Verify admin can revoke members
- Team quota subtracts from usage on request completion
- Tests: 12+ scenarios (CRUD, roles, quota enforcement)

---

### Unit C: Usage Analytics & Export (1 week)

**Goal:** Provide detailed usage reports and exports for cost allocation.

**Files:**
- `app/api/analytics/usage/route.ts` (new)
- `app/api/analytics/export/route.ts` (new)
- `lib/analytics.ts` (new)

**Features:**

1. **Usage Dashboard** — `GET /api/analytics/usage`
   ```json
   {
     "period": "2026-04",
     "team": { "id": "team_123", "name": "Acme Corp" },
     "totals": {
       "score_calls": 1250,
       "optimize_calls": 450,
       "total_tokens": 187500,
       "cost_estimate": 18.75
     },
     "by_endpoint": {
       "score": { "calls": 1250, "tokens": 125000, "cost": 12.50 },
       "optimize": { "calls": 450, "tokens": 62500, "cost": 6.25 }
     },
     "by_member": [
       { "userId": "user_abc", "calls": 500, "tokens": 75000, "cost": 7.50 },
       { "userId": "user_xyz", "calls": 1200, "tokens": 112500, "cost": 11.25 }
     ],
     "daily_breakdown": [
       { "date": "2026-04-01", "calls": 100, "cost": 10.00 }
     ]
   }
   ```

2. **Export** — `GET /api/analytics/export?format=csv&period=2026-04`
   - CSV: User-friendly download for spreadsheets
   - JSON: Machine-readable for billing systems
   - Formats: Daily, weekly, monthly summaries
   - Fields: Endpoint, user, timestamp, tokens, cost

**Data Source:** Extended `OptimizationRecord` with `tokens_used` and `cost_estimate` fields.

**Verification:**
- Dashboard aggregates correctly (sum matches detail)
- CSV import cleanly into spreadsheet
- JSON valid for downstream billing system
- Filters: by date range, by user, by team member
- Tests: 8+ scenarios

---

### Unit D: Stripe Billing Integration (2 weeks)

**Goal:** Enable pay-as-you-go pricing with monthly invoicing and self-serve billing portal.

**Files:**
- `lib/stripe.ts` (new)
- `app/api/billing/checkout/route.ts` (new)
- `app/api/billing/portal/route.ts` (new)
- `app/api/webhooks/stripe/route.ts` (new)
- `prisma/migrations/20260515_add_billing/` (new)

**Stripe Models:**
```prisma
model BillingAccount {
  id String @id @default(cuid())
  teamId String @unique
  stripeCustomerId String
  stripeSubscriptionId String?
  pricingTier "free" | "pro" | "enterprise"
  monthlyAllowance Int // Free tier: 1000 calls/month
  currentMonthUsage Int
  nextBillingDate DateTime
  createdAt DateTime @default(now())
}

model Invoice {
  id String @id @default(cuid())
  teamId String
  stripeInvoiceId String @unique
  amount Int // cents
  period DateTime
  status "draft" | "sent" | "paid" | "overdue"
  createdAt DateTime @default(now())
}
```

**Features:**

1. **Pricing Tiers**
   | Tier | Monthly Cost | Included | Per-call cost |
   |------|------------|----------|--------------|
   | Free | $0 | 1,000 calls | - |
   | Pro | $99 | 50,000 calls | $0.001/call overage |
   | Enterprise | Custom | Unlimited | Negotiated |

2. **Endpoints**
   - `GET /api/billing/account` — Current billing status
   - `POST /api/billing/checkout` — Start Stripe checkout (upgrade team)
   - `GET /api/billing/portal` — Link to Stripe customer portal
   - `GET /api/billing/invoices` — View past invoices

3. **Stripe Webhooks** — `POST /api/webhooks/stripe`
   - `customer.subscription.updated` → Update `pricingTier`
   - `invoice.payment_succeeded` → Mark invoice paid
   - `invoice.payment_failed` → Alert admin, throttle API

**Verification:**
- Create team → free tier (1000/month included)
- Exceed free tier → calculate overage cost
- Upgrade to Pro via Stripe → increase allowance
- Stripe webhook updates subscription status
- Invoice generation on month boundary
- Tests: 10+ scenarios

---

### Unit E: Audit Trails & Compliance (1.5 weeks)

**Goal:** Log all API activity and administrative actions for compliance and debugging.

**Files:**
- `prisma/schema.prisma` (add AuditLog model)
- `lib/audit.ts` (new)
- `app/api/audit/route.ts` (new)

**AuditLog Model:**
```prisma
model AuditLog {
  id String @id @default(cuid())
  teamId String
  userId String
  action String // "api_call", "key_created", "key_rotated", "member_added", "quota_updated"
  resource String // "api_key", "team_member", "quota", "webhook"
  resourceId String?
  details Json // Action-specific details
  ipAddress String?
  userAgent String?
  status "success" | "failure" // success or failure
  error String?
  timestamp DateTime @default(now())

  @@index([teamId])
  @@index([userId])
  @@index([action])
}
```

**Events to Log:**
- API calls (`api_call`): endpoint, user, tokens, cost
- API key operations: creation, rotation, revocation
- Team membership: invite, accept, role change, removal
- Quota changes: monthly limit updated
- Billing: tier upgrade/downgrade, payment status

**Endpoints:**
- `GET /api/audit?teamId=&startDate=&endDate=&action=` — Query audit logs
- Export audit log as JSON (read-only, admin only)

**Verification:**
- All API calls logged with user, endpoint, tokens
- Key operations create audit trail
- Team admin can view team audit logs (can't view other teams)
- Cannot be tampered with (immutable records)
- Tests: 8+ scenarios

---

### Unit F: Advanced API Key Scoping (1 week)

**Goal:** Enable IP whitelisting, endpoint restrictions, and read-only keys.

**Files:**
- `lib/keys.ts` (extend)
- `lib/rbac.ts` (extend)
- `app/api/keys/[id]/route.ts` (extend)

**Extended ApiKey Model:**
```prisma
extend ApiKey {
  ipWhitelist String? // "192.168.1.1,10.0.0.0/8" or NULL (any IP)
  endpoints String[] // ["score", "optimize-full"] or [] (all)
  readonly Boolean @default(false) // Can only call endpoints, not manage team
  expiresAt DateTime? // Auto-revoke after date
}
```

**Scope Checks:**
1. **IP Whitelist**: Reject if request IP not in list
2. **Endpoint Filter**: Return 403 if key not scoped to endpoint
3. **Read-Only**: Reject any /api/teams or /api/keys calls
4. **Expiration**: Auto-revoke on `expiresAt` date

**Verification:**
- Create key with IP whitelist → call from whitelisted IP (allowed), other IP (403)
- Create key with endpoint scope → call allowed endpoint (allowed), other (403)
- Create read-only key → can call /api/score (allowed), /api/keys (403)
- Create key with expiration → call before expiry (allowed), after (403)
- Tests: 12+ scenarios

---

## Testing Strategy

### Unit Tests
- 80+ new unit tests across all units
- Focus: Model creation, validation, permission checks, quota math
- Tools: Jest, mock Stripe API

### Integration Tests
- 30+ integration tests
- Scenarios: Team creation → member invite → API call → usage logged → billing calculated
- End-to-end: User → Team → Quota → API call → Analytics → Invoice

### Performance Tests
- Team quota lookup: < 50ms (cached)
- Usage analytics query: < 1s (1M+ records)
- Export generation: < 5s (CSV 100K rows)

---

## Rollout Strategy

### Phase 9.1 (Week 1-2): Foundation
- Merge Unit A (schema) to main
- Deploy to staging, validate migrations
- No user-facing changes yet

### Phase 9.2 (Week 3-4): Team Management
- Merge Unit B (team APIs)
- Feature-gate behind `ENABLE_TEAMS=true` env var
- Beta test with internal team

### Phase 9.3 (Week 5-6): Analytics & Billing
- Merge Unit C + Unit D
- Stripe test account configured
- Free tier auto-assigned to existing users

### Phase 9.4 (Week 7-8): Audit & Advanced Scoping
- Merge Unit E + Unit F
- Full compliance mode enabled
- Marketing launch of paid tiers

---

## Success Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| Team adoption | 20% of users by 30 days | Product |
| Billing conversion | 10% to paid tiers by 90 days | Revenue |
| Audit log completeness | 100% of API calls logged | Compliance |
| Usage export accuracy | 99.9% match to actual usage | Finance |
| Key expiration enforcement | 100% auto-revoke on expiry | Security |

---

## Dependencies & Risks

### External Dependencies
- **Stripe Account**: Production account required (test account sufficient for Phase 9.2)
- **Email Service**: Transactional email for team invites (SendGrid / AWS SES)
- **PostgreSQL**: Phase 9.3+ requires PostgreSQL (SQLite insufficient for scale)

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Stripe API outage | Users can't upgrade tiers | Graceful fallback: free tier active until restored |
| Migration scaling issue | Billing calculation slow | Batch processing + caching, async updates |
| Permission escalation | User access other team's data | Strict RBAC tests, audit all queries |

---

## Open Questions (To Resolve During Implementation)

1. Should teams have sub-teams (nested orgs)?
   - **Decision point:** Unit A schema review

2. Should we support SSO (OIDC) for team members?
   - **Deferred:** Phase 9.2+ (auth out of scope for Phase 9.0)

3. Free tier limits: 1,000 calls/month or per day?
   - **Decision point:** Unit D Stripe review

4. Custom pricing for enterprise customers?
   - **Yes**, via "Enterprise" tier with manual pricing in Stripe

---

## Success Criteria (Phase 9 Complete)

- [ ] All 6 units merged to main
- [ ] 110+ new tests, all passing
- [ ] Team management fully functional (CRUD, roles, quotas)
- [ ] Usage analytics accurate to cent
- [ ] Stripe billing producing valid invoices
- [ ] Audit logs complete for compliance
- [ ] API key scoping prevents unauthorized access
- [ ] Zero breaking changes to v1.0 API
- [ ] Migration guide from personal quotas to team quotas
- [ ] Operations playbook (team onboarding, quota increases, Stripe troubleshooting)

---

## Timeline Summary

| Phase | Duration | Start | Deliverable |
|-------|----------|-------|-------------|
| 9.1 | 2 weeks | 2026-05-01 | Schema + migrations |
| 9.2 | 2 weeks | 2026-05-15 | Team APIs (beta) |
| 9.3 | 2 weeks | 2026-05-29 | Analytics + Billing |
| 9.4 | 2 weeks | 2026-06-12 | Audit + Scoping (GA) |
| **Total** | **8 weeks** | | v2.0.0 release |

---

## Next Steps (To Start Phase 9)

1. **Design Review**: Review schema design with backend team (1 day)
2. **Stripe Setup**: Create production account, configure webhooks (1 day)
3. **Email Service**: Select and configure SendGrid or equivalent (1 day)
4. **Unit A Kickoff**: Begin schema design + migration tests (2 weeks)
5. **Parallel Work**: Design billing pricing model while Unit A in progress

---

**Prepared by:** Claude Code  
**Date:** April 14, 2026  
**Status:** Ready for planning review
