---
title: Webhook Filtering with MongoDB-Style DSL
problem_type: knowledge_pattern
module: seo-content-system
component: webhooks
category: integration-patterns
tags:
  - webhooks
  - filtering
  - conditional-delivery
  - mongodb-dsl
  - event-driven
  - fail-closed
date: 2026-04-15
applies_when: Implementing conditional webhook delivery based on event payload patterns using MongoDB-style query operators
context: |
  Phase 8 P6 implementation for advanced webhook filtering/routing. Added filterRulesJson column to webhookSubscriptions, implemented evaluateFilter() service with 7+ comparators ($gt, $lt, $gte, $lte, $ne, $in, $exists), integrated fail-closed evaluation into deliverToSubscription() before sendWithRetry().
pattern: |
  1. Store filter DSL as JSON column (filterRulesJson)
  2. Implement filter evaluator: resolveFieldPath() for nested fields (e.g., "data.status"), evaluateCondition() for operators
  3. Support MongoDB operators: $eq, $ne, $gt, $lt, $gte, $lte, $in, $exists
  4. Integrate into delivery pipeline: evaluate before sending, skip if no match
  5. Fail-closed error handling: malformed filters prevent delivery, log error
  6. Backward compatible: empty/null filters always match
key_decisions: |
  - AND logic (all conditions must match)
  - Synchronous evaluation (no async within filter check)
  - Fail-closed: JSON parse errors or unknown operators return false
  - Deep path resolution using dot notation (e.g., "payload.data.nested.field")
  - Filters not recorded in delivery history if they don't match
learnings: |
  - MongoDB query operators map cleanly to webhook filtering logic
  - Fail-closed semantics prevent accidental message loss from malformed rules
  - Optional filterRules field maintains backward compatibility with existing webhooks
  - Synchronous evaluation is safer than async for filter matching critical path
  - Deep path navigation with undefined checks prevents crashes on missing fields
related_issues:
  - seo-content-system Phase 8 P6
  - Plan: docs/plans/2026-04-15-002-feat-phase8p6-webhook-filtering-plan.md
---

# Webhook Filtering with MongoDB-Style DSL

## Context

Webhook subscriptions historically delivered all matching events without conditional filtering. Users needed to receive only specific events—for example, success jobs lasting longer than 60 seconds, or only events with specific tags. Without filtering at the source, clients received noise; with filtering implemented at delivery time, precise event routing became possible.

This pattern addresses the challenge of scaling webhook delivery when clients have diverse filtering needs. Rather than forcing clients to implement filtering logic downstream, the pattern moves filtering into the broker—reducing bandwidth, simplifying client code, and enabling audit-friendly event routing.

## Guidance

The pattern for implementing conditional webhook delivery follows these principles:

### 1. Define a filter DSL

Choose a familiar syntax for filter expression. MongoDB-style operators (`$gt`, `$lt`, `$in`, etc.) provide compact syntax and clear semantics that developers already know.

**Example filter:**
```json
{
  "data.status": "success",
  "data.durationMs": { "$gt": 60000 }
}
```

This reads as: "deliver when status is 'success' AND duration exceeds 60000 milliseconds."

### 2. Implement recursive field resolution

Support dot notation for nested field access. Walking a path like `data.durationMs` requires traversing the payload object safely, stopping gracefully when a field doesn't exist.

```typescript
function resolveFieldPath(payload: Record<string, any>, path: string): any {
  const parts = path.split(".");
  let current = payload;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
```

**Key detail:** Return `undefined` for missing fields; treat `undefined` as non-matching in the condition evaluator.

### 3. Support comparator operators

Implement at least seven operators (the core set):

| Operator | Meaning | Example |
|----------|---------|---------|
| `$eq` | Equals | `{ "data.status": { "$eq": "success" } }` |
| `$ne` | Not equals | `{ "data.status": { "$ne": "pending" } }` |
| `$gt` | Greater than | `{ "data.durationMs": { "$gt": 60000 } }` |
| `$lt` | Less than | `{ "data.durationMs": { "$lt": 100000 } }` |
| `$gte` | Greater than or equal | `{ "data.durationMs": { "$gte": 60000 } }` |
| `$lte` | Less than or equal | `{ "data.durationMs": { "$lte": 120000 } }` |
| `$in` | Array membership | `{ "data.tag": { "$in": ["important", "urgent"] } }` |
| `$exists` | Field presence | `{ "data.retried": { "$exists": true } }` |

Also support **scalar equality** (implicit `$eq`):

```json
{
  "data.status": "success"  // shorthand for { "$eq": "success" }
}
```

This keeps simple filters readable.

**Implementation pattern:**

```typescript
function evaluateCondition(value: any, condition: any): boolean {
  // Scalar equality
  if (typeof condition !== "object" || condition === null || Array.isArray(condition)) {
    return value === condition;
  }

  // Object with operators
  for (const [operator, operand] of Object.entries(condition)) {
    switch (operator) {
      case "$eq":
        if (value !== operand) return false;
        break;
      case "$ne":
        if (value === operand) return false;
        break;
      case "$gt":
        if (typeof value !== "number" || value <= (operand as number)) return false;
        break;
      case "$lt":
        if (typeof value !== "number" || value >= (operand as number)) return false;
        break;
      case "$gte":
        if (typeof value !== "number" || value < (operand as number)) return false;
        break;
      case "$lte":
        if (typeof value !== "number" || value > (operand as number)) return false;
        break;
      case "$in":
        if (!Array.isArray(operand) || !operand.includes(value)) return false;
        break;
      case "$exists":
        const exists = value !== undefined && value !== null;
        if (operand && !exists) return false;
        if (!operand && exists) return false;
        break;
      default:
        // Unknown operator: fail closed
        return false;
    }
  }
  return true;
}
```

### 4. Fail-closed error handling

Malformed filters must never crash the delivery pipeline or cause unintended delivery. The rule: if anything goes wrong evaluating a filter, **do not deliver**.

```typescript
if (sub.filterRulesJson) {
  try {
    const filterRules = JSON.parse(sub.filterRulesJson);
    if (!evaluateFilter(filterRules, payload)) {
      console.info(`[WebhookDelivery] Filter did not match for webhook ${sub.id}, skipping delivery`);
      return;
    }
  } catch (error) {
    console.error(`[WebhookDelivery] Error evaluating filter for webhook ${sub.id}:`, error);
    return; // fail-closed: skip delivery on any error
  }
}
```

**Why this matters:** A malformed filter (JSON syntax error, unknown operator, type mismatch) in one webhook should never block other webhooks or cause the delivery system to crash. Skipping delivery is safer than attempting to send.

### 5. Synchronous evaluation before async fire-and-forget

Evaluate the filter **before** queueing async delivery. This ensures:
- Filter logic runs eagerly and completes synchronously
- Filtered-out events never enter the delivery queue
- Delivery queue contains only events that passed filtering

```typescript
// Inside deliverToSubscription():
const now = Math.floor(Date.now() / 1000);
const fullPayload = { event, timestamp: now, data: payload };

// Synchronous filter check BEFORE sendWithRetry
if (sub.filterRulesJson) {
  const filterRules = JSON.parse(sub.filterRulesJson);
  if (!evaluateFilter(filterRules, payload)) {
    return; // skip delivery
  }
}

// Now proceed with async retry loop
await this.sendWithRetry(sub, event, fullPayload);
```

### 6. Keep filters optional

Maintain backward compatibility. Subscriptions created before filtering was added have `filterRulesJson = null`, and `null` filters match all events (pre-existing behavior).

```typescript
// In evaluateFilter():
if (!filterRules || Object.keys(filterRules).length === 0) {
  return true;  // Empty/null filter always matches
}
```

## Why This Matters

- **Reduces webhook noise**: Clients receive only relevant events instead of every matching event. Example: a client interested only in errors doesn't need to process success events, validate filters, and discard them.

- **Reduces client-side burden**: Filtering at the source eliminates redundant logic. Without this pattern, every client would need to re-implement the same filter logic downstream.

- **Prevents DoS**: Fail-closed design prevents malformed filters from triggering delivery loops or crashes. A bad filter rule affects only that subscription, not the entire system.

- **Scalable filtering**: Centralized filter evaluation at the broker scales better than distributed client-side filtering. 100 clients receive 1 filtered event instead of 100 unfiltered copies.

- **Audit-friendly**: Event routing decisions are logged and stored centrally, making it easy to understand which clients received which events.

## When to Apply

- **Building event-driven systems** where subscribers need flexible filtering without custom code.
- **When preventing webhook noise is a priority**—e.g., a large number of event types but clients only care about a subset.
- **When you want to reduce bandwidth** by sending only relevant payloads to each subscriber.
- **When audit or compliance requirements demand precise event routing**—the filter rules are an audit trail of intent.
- **Scaling webhook delivery**—centralized filtering is cheaper (fewer payloads sent) and simpler (no client-side logic).

**Not applicable when:**
- All subscribers need all events (no filtering needed).
- Subscribers have vastly different filtering needs (custom per-client code may be necessary).
- Filter rules are extremely complex (may require a full query engine, not just operator matching).

## Examples

### Example 1: Status-based filtering

```json
{
  "data.status": "success"
}
```

**Behavior:** Deliver only when the event status is "success". Useful for notifying clients only of successful operations.

### Example 2: Duration thresholds

```json
{
  "data.durationMs": { "$gte": 60000, "$lte": 120000 }
}
```

**Behavior:** Deliver only jobs that lasted between 60 and 120 seconds. Useful for identifying "slow but not too slow" jobs, e.g., for SLA analysis.

### Example 3: Multi-condition filtering (AND logic)

```json
{
  "data.status": "success",
  "data.durationMs": { "$gt": 60000 }
}
```

**Behavior:** Both conditions must match. Deliver only successful jobs lasting longer than 60 seconds. Example use case: a dashboard showing notable successes.

### Example 4: Array membership

```json
{
  "data.tags": { "$in": ["important", "urgent", "critical"] }
}
```

**Behavior:** Deliver events where the `tags` field contains at least one of the specified values. Example use case: a notification system that only alerts on critical tags.

### Example 5: Field existence

```json
{
  "data.retried": { "$exists": true }
}
```

**Behavior:** Deliver only events that have a `retried` field present. Example use case: monitoring retried operations for reliability analysis.

### Example 6: Combining multiple operators

```json
{
  "data.status": "failed",
  "data.errorCode": { "$in": [500, 502, 503] },
  "data.timestamp": { "$gte": 1713176400 }
}
```

**Behavior:** Deliver only server errors (5xx) that are failures, after a specific timestamp. All three conditions must be true. Example use case: post-incident alerting for specific error classes.

## Prevention & Best Practices

### 1. Always validate filter rules on insert/update

Before saving a filter to the database, validate it against the schema:
- JSON must be valid
- All operators must be recognized
- Operand types must match the operator (e.g., `$gt` requires a number)

```typescript
function validateFilterRules(rules: Record<string, any>): boolean {
  const VALID_OPERATORS = ["$eq", "$ne", "$gt", "$lt", "$gte", "$lte", "$in", "$exists"];
  for (const [field, condition] of Object.entries(rules)) {
    if (typeof condition === "object" && condition !== null && !Array.isArray(condition)) {
      for (const operator of Object.keys(condition)) {
        if (!VALID_OPERATORS.includes(operator)) {
          return false;  // Unknown operator
        }
      }
    }
  }
  return true;
}
```

### 2. Document filter rule usage

Maintain clear guidance on which payload fields are available for filtering in each event type. Example:

```markdown
## Filterable Fields by Event Type

### job.completed
- `data.status` (string): "success", "failed", "cancelled"
- `data.durationMs` (number): job execution time
- `data.tags` (array): custom tags assigned to the job
- `data.retried` (boolean): whether the job was retried
```

### 3. Log filter evaluation for debugging

When a filter doesn't match, log why. This helps clients debug their filter rules:

```typescript
console.info(`[WebhookFilter] Non-match for webhook ${sub.id}`, {
  eventType: event,
  filterRules: sub.filterRules,
  payloadSample: payload,  // truncate if large
  reason: "field value did not match condition"
});
```

### 4. Test filters via a /test endpoint

Provide a test webhook endpoint that applies a filter to a sample payload:

```
POST /api/webhooks/:id/test
Body: { filterRules: {...}, samplePayload: {...} }
Response: { matches: true/false, explanation: "..." }
```

This lets clients validate their filters before saving.

### 5. Monitor filter performance

Track filter evaluation latency. If filters become a bottleneck:
- Consider caching pre-compiled filters
- Cache field path resolution for repeated accesses
- Profile slow operators (e.g., large `$in` arrays)

```
metric: webhook_filter_evaluation_ms
  histogram: [0.1, 0.5, 1.0, 5.0, 10.0]  // percentiles
```

## Implementation Reference

- **Schema:** `webhookSubscriptions.filterRulesJson` (nullable TEXT)
- **Service:** `backend/src/services/webhookFilterService.ts`
- **Integration:** `backend/src/services/webhookDeliveryService.ts` (inside `deliverToSubscription()`)
- **API:** `PATCH /api/webhooks/:id` with `filterRules` body
- **Tests:** 30 test cases (24 filter service, 6 integration)
- **Documentation:** `backend/docs/WEBHOOK_FILTERING.md`

---

**Phase 8 P6 Completion:** Commit 93b665b  
**Date:** 2026-04-15
