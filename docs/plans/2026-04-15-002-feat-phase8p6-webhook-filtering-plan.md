---
title: Phase 8 P6 — Advanced Webhook Filtering & Routing
type: feat
status: completed
date: 2026-04-15
completed_at: 2026-04-15
implementation_commit: 93b665b
implementation_doc: docs/solutions/integration-patterns/webhook-filtering-mongodb-dsl-2026-04-15.md
---

# Phase 8 P6: Advanced Webhook Filtering & Routing

## Overview

Phase 8 P6 extends the webhook system with conditional delivery and intelligent routing. Users can define rules to filter webhook events based on payload patterns and route matching events to multiple endpoints — enabling fine-grained control over which webhooks fire for which data.

**Example use case:** A user subscribes to `job.completed` events but only wants to send webhooks when the job status is "success" and the duration exceeds 60 seconds. With P6, they can define a rule: `filter: {data.status: "success", data.durationMs: {$gt: 60000}}` and have the webhook fire conditionally.

## Problem Frame

Currently, webhooks are binary: subscribe to an event type and receive **all** instances of that event. Users lack:
- Event filtering based on payload contents
- Selective routing (e.g., route job.completed events to different endpoints based on outcome)
- Rule-based transformation or conditional delivery
- Payload pattern matching

This forces users to implement filtering logic in their webhook receiver, adding complexity and unnecessary traffic. P6 moves that filtering into the platform.

## Requirements Trace

- **R1.** Users can define filter rules per webhook subscription (payload pattern matching)
- **R2.** Filter rules support common comparators: equality, numeric ranges, existence checks
- **R3.** When an event is dispatched, the webhook only fires if the filter rule matches the payload
- **R4.** Users can route a single event to multiple webhooks with different filters
- **R5.** Failed filter evaluations fall back safely (do not fire)
- **R6.** Filters are optional; webhooks without filters behave as today (fire for all matching events)
- **R7.** Filter rules are visible and editable via the API

## Scope Boundaries

- **Out of scope:** Event transformation/mutation (payload rewriting). Filters are read-only pattern matches.
- **Out of scope:** Rule composition/OR logic. Filters are AND-only (all conditions must match).
- **Out of scope:** Dynamic filter generation. Filters are user-defined, not AI-generated.
- **Out of scope:** Complex path expressions. Filters match top-level and one-level-deep object keys only.

## Context & Research

### Relevant Code and Patterns

- `backend/src/services/webhookDeliveryService.ts` — Dispatch logic entry point (`dispatch()`, `deliverToSubscription()`)
- `backend/src/api/webhooks.ts` — Webhook CRUD endpoints
- `backend/src/db/schema.ts` — `webhookSubscriptions` table (add `filterRules` column)

### Institutional Learnings

- Phase 8 P4 delivery history tracking confirms we record all dispatch attempts. Filter evaluation should occur **before** delivery so filtered-out events do not appear in history.
- Phase 8 P5 exponential backoff indicates retry/delivery is fire-and-forget via `setImmediate`. Filter evaluation is synchronous and must happen inside the dispatch callback.

### External References

- Webhook event filtering is common in GitHub (branch/tag filters), Stripe (event type/object type filters), and Segment (destination filters)
- Filter DSL patterns: JSON Schema validation, MongoDB query syntax, GraphQL filters — we'll use a simple JSON DSL similar to MongoDB's `{field: value}` syntax for clarity

## Key Technical Decisions

- **Filter storage:** Add `filterRulesJson` nullable text column to `webhookSubscriptions` table. Parsed on read, stored as JSON for flexibility.
- **Filter evaluation timing:** Synchronous evaluation happens inside `deliverToSubscription()`, before `sendWithRetry()`. Filtered events are not recorded in delivery history.
- **Comparators:** Support `=`, `!=`, `>`, `<`, `>=`, `<=`, `$exists` (truthy check), `$in` (array membership). No regex or complex expressions.
- **Error handling:** If filter evaluation throws (malformed JSON, type mismatch), log error and **do not fire** (safe-default fail-closed).
- **User experience:** Filter rules are optional. Empty or missing `filterRulesJson` means "match all events" (backward compatible).

## Open Questions

### Resolved During Planning

- **Filter DSL shape:** Use MongoDB-inspired syntax: `{data.status: "success", data.durationMs: {$gt: 60000}}`. Simple, familiar to many engineers.
- **Filter visibility:** Include `filterRules` (as object, not JSON) in GET `/webhooks` response to show users what filters are applied.
- **Partial matches:** If a filter references `data.nonexistent`, treat as falsy (does not match). Avoids crashes on schema evolution.

### Deferred to Implementation

- **Performance at scale:** Filter evaluation on 1000s of webhooks. Optimize if profiling shows bottleneck (likely not until P7+).
- **Filter rule validation:** UX for user feedback if filter syntax is invalid. For now, log server-side; improve in P7.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

**Filter Evaluation Flow:**

```
webhookDeliveryService.dispatch(event, payload, userId)
  ↓
for each subscription in subscriptions matching event:
  ↓
  if subscription.filterRules exists:
    ↓
    evaluateFilter(subscription.filterRules, payload)
      - Check each {field: condition} in filterRules
      - All conditions must match (AND logic)
      - Return true/false
    ↓
    if filter result is false:
      - Skip this subscription
      - Do not record in history
      - Continue to next subscription
  ↓
  deliverToSubscription(subscription, event, payload)
    - Send with retries (existing logic)
    - Record in history
```

**Filter Rule DSL Example:**

```json
{
  "data.status": "success",
  "data.durationMs": { "$gt": 60000 },
  "data.tag": { "$in": ["important", "urgent"] },
  "data.retried": { "$exists": true }
}
```

Evaluates to `true` only if payload has:
- `data.status === "success"` AND
- `data.durationMs > 60000` AND
- `data.tag` in ["important", "urgent"] AND
- `data.retried` property exists (truthy)

## Implementation Units

- [ ] **Unit 8.6.1: Database Schema & API Endpoint Updates**

**Goal:** Add filter rule storage to webhooks and expose filter editing via API

**Requirements:** R1, R6, R7

**Dependencies:** None

**Files:**
- Modify: `backend/src/db/schema.ts` — Add `filterRulesJson` nullable text column to `webhookSubscriptions`
- Modify: `backend/src/api/webhooks.ts` — Update PATCH `/webhooks/:id` to accept `filterRules` object; validate and serialize
- Test: `backend/tests/api/webhooks.test.ts` — Test PATCH with valid/invalid filters, filter validation

**Approach:**
- Add `filterRulesJson: text("filter_rules_json")` to `webhookSubscriptions` table (nullable, defaults to null)
- Update webhook create/update endpoints to accept optional `filterRules` in request body
- Validate filter rule shape: must be an object with string keys and condition objects
- Serialize to JSON for storage, deserialize on read
- Return `filterRules` as parsed object in GET responses (not raw JSON string)

**Patterns to follow:**
- Follow existing PATCH endpoint validation pattern in Unit 8.3.2 (validate, update, return full object)
- Error responses: 400 for invalid filter syntax, 404 for non-existent webhook, 403 for cross-user attempt

**Test scenarios:**
- Happy path: PATCH with valid filter rule, verify serialized and returned
- Edge case: Filter rule with nested object depth > 1, validate rejection or depth limit
- Edge case: PATCH with `filterRules: null`, verify clears existing filter
- Error path: PATCH with invalid JSON in filterRules, verify 400 and error message
- Error path: PATCH with unknown comparator (not in allowed set), verify 400

**Verification:**
- PATCH `/webhooks/hook_123` with `{filterRules: {data.status: "success"}}` returns updated webhook with filters visible
- Webhook list includes filter rules in response
- Filter validation rejects malformed rules before storage

---

- [ ] **Unit 8.6.2: Filter Evaluation Service**

**Goal:** Implement filter matching logic with safe error handling

**Requirements:** R1, R3, R5

**Dependencies:** Unit 8.6.1

**Files:**
- Create: `backend/src/services/webhookFilterService.ts` — Filter evaluation logic
- Modify: `backend/src/services/webhookDeliveryService.ts` — Call filter evaluation before delivery
- Test: `backend/tests/services/webhookFilterService.test.ts` — Unit tests for filter matching

**Approach:**
- Implement `evaluateFilter(filterRules: Record<string, any>, payload: Record<string, any>): boolean` function
- For each `field: condition` in filter rules:
  - Resolve field path in payload (e.g., `data.status` → `payload.data.status`)
  - Apply condition logic:
    - If condition is a scalar: equality check
    - If condition is an object: apply comparator operators (`$gt`, `$lt`, `$in`, `$exists`, etc.)
  - If any field does not match, return false immediately
- On error (malformed filter, type mismatch): log and return false (fail-closed)
- Integrate into `deliverToSubscription()`: evaluate filter before calling `sendWithRetry()`

**Patterns to follow:**
- Error handling: try-catch around filter evaluation, log error with webhook ID and filter rule
- Field resolution: handle deep paths like `data.nested.field`; partial paths (nonexistent keys) are falsy

**Test scenarios:**
- Happy path: Filter rule matches payload, returns true
- Happy path: Multiple conditions in filter, all match, returns true
- Edge case: Payload has extra fields not in filter, filter still matches (extra fields ignored)
- Edge case: Filter field is deeply nested (3+ levels), resolve correctly
- Edge case: Filter references nonexistent field in payload, treat as falsy
- Error path: Filter has invalid comparator operator, return false and log
- Error path: Filter rule is malformed JSON, handle gracefully
- Integration: Webhook with filter rule: dispatch event, verify filter evaluated and delivery conditional

**Verification:**
- `evaluateFilter({data.status: "success"}, {event: "job.completed", data: {status: "success", id: "123"}})` returns true
- `evaluateFilter({data.status: "failed"}, {event: "job.completed", data: {status: "success", id: "123"}})` returns false
- Dispatch event with matching filter fires webhook; dispatch with non-matching filter does not fire

---

- [ ] **Unit 8.6.3: Conditional Delivery Integration**

**Goal:** Wire filter evaluation into dispatch flow

**Requirements:** R2, R3, R4

**Dependencies:** Unit 8.6.1, Unit 8.6.2

**Files:**
- Modify: `backend/src/services/webhookDeliveryService.ts` — Update `deliverToSubscription()` to check filter before delivery
- Test: `backend/tests/services/webhookDeliveryService.test.ts` — Integration tests for conditional delivery

**Approach:**
- In `deliverToSubscription()`, after fetching subscription and before calling `sendWithRetry()`:
  - If `subscription.filterRulesJson` exists, parse and evaluate filter
  - If filter returns false, log skip reason and return early (do not call `sendWithRetry()`)
  - If filter returns true (or no filter), proceed with delivery as before
- Ensure filtered events are **not** recorded in delivery history (verification of R3)
- Log skipped deliveries at info level with webhook ID and reason ("filter did not match")

**Patterns to follow:**
- Fire-and-forget via `setImmediate` remains unchanged; filter eval is inside callback
- Error handling: if filter evaluation throws, log and treat as "do not fire"

**Test scenarios:**
- Happy path: Dispatch event with webhook that has matching filter, verify delivery occurs
- Happy path: Dispatch event with webhook that has non-matching filter, verify delivery skipped
- Happy path: Dispatch event with webhook that has no filter, verify delivery occurs (backward compat)
- Edge case: Webhook has filter rule, multiple events dispatched, some match and fire, others skip
- Edge case: Multiple webhooks for same event, each with different filter rules, only matching ones fire
- Integration: Rate limiting + filtering: verify rate limit counts all attempts including filtered-out events (or clarify in deferred section)

**Verification:**
- Dispatch event with filter-enabled webhook: if filter matches, delivery history shows attempt; if filter doesn't match, history is empty
- Dispatch event with multiple webhooks subscribed to same event, different filters: verify only matching webhooks fire

---

- [ ] **Unit 8.6.4: API Documentation & Examples**

**Goal:** Document filter rule syntax and behavior

**Requirements:** R7

**Dependencies:** Unit 8.6.1, Unit 8.6.2

**Files:**
- Create: `backend/docs/WEBHOOK_FILTERING.md` — Filter DSL reference and examples

**Approach:**
- Document supported comparators: `=` (equality), `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in`, `$exists`
- Show examples of common use cases
- Explain evaluation logic: AND-only, partial matches, error handling
- Show curl/SDK examples for creating and updating webhooks with filters

**Verification:**
- Documentation is clear enough for a user to write a valid filter rule without trial-and-error
- Examples cover common patterns (status checks, numeric thresholds, field existence)

## System-Wide Impact

- **Interaction graph:** Filter evaluation is inside `deliverToSubscription()`, synchronous, no callbacks
- **Error propagation:** Malformed filters log errors but do not crash; webhook dispatch continues safely
- **State lifecycle:** Filter rules are immutable once stored; updates via PATCH endpoint
- **API surface parity:** Filter rules are optional; existing webhooks without filters work unchanged
- **Integration coverage:** Dispatch + filter evaluation must be tested end-to-end; mocking dispatch alone won't prove filter behavior
- **Unchanged invariants:** Retry logic, HMAC signing, rate limiting, delivery history recording remain unchanged

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Filter eval performance on 10k+ webhooks | Not expected to be bottleneck (eval is O(n) per field). Profile if P7+ performance review flags it. |
| Malformed filter rules cause silent failures | Fail-closed (return false, log error). Webhook does not fire if eval fails — safe but may confuse users. Add validation feedback in P7. |
| Users write overly complex filters expecting OR/regex | Scope boundary is clear: AND-only, simple comparators. Documentation should set expectations. |
| Filter DSL incompatible with future enhancements | Chose MongoDB-style syntax because it's extensible (easy to add $or, $regex, $size later). |

## Documentation / Operational Notes

- **Docs to update:** Add `WEBHOOK_FILTERING.md` with DSL reference, examples, and error handling notes
- **Monitoring:** Log all filter evaluation errors (malformed rules, eval exceptions) under `[WebhookFilter]` tag for debugging
- **Rollout:** No special rollout required; filters are opt-in (backward compatible)

## Sources & References

- Related code: `backend/src/services/webhookDeliveryService.ts` (dispatch logic), `backend/src/api/webhooks.ts` (CRUD endpoints)
- Related PRs/issues: Phase 8 P4 (delivery history), Phase 8 P5 (key rotation + retry strategy)
