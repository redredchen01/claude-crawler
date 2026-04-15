---
name: api-aggregation-notifier
keywords: api, aggregation, slack, webhook, notification, framework
---

# /api-aggregation-notifier

**Universal API aggregation and Slack dispatch framework**

Fetch data from multiple REST/GraphQL APIs → transform to tables → send to Slack/email

## Use When

- Polling multiple APIs (GitHub, Linear, Google Workspace, custom endpoints)
- Aggregating results into formatted tables  
- Dispatching notifications to Slack channels
- Scheduling recurring reports (daily standup, weekly summary)

## Framework Components

### 1. Multi-Source Fetcher
- REST (HTTP with auth, headers, pagination)
- GraphQL (queries, variables, auth)
- Built-in SDK support (GitHub, Linear, Slack, Google)

### 2. Data Transformer
- Table formatting (Markdown, JSON, CSV)
- Field mapping, filtering, aggregation
- Sorting, deduplication, limits

### 3. Slack Dispatcher
- Block Kit formatting with rich tables
- Thread/channel routing
- Retry logic with exponential backoff

## Implementation Phases

- **Phase 1:** Core REST fetcher + table transformer (4hrs)
- **Phase 2:** GraphQL support + auth matrix (2hrs)
- **Phase 3:** Slack dispatcher + threading (2hrs)

## Config Example

```yaml
sources:
  - type: rest
    url: "https://api.github.com/repos/redredchen01/Clausidian/pulls"
    auth: github_token
    method: GET
    
  - type: graphql
    url: "https://api.linear.app/graphql"
    query: |
      query { team(id: "TEAM") { issues(first: 50) { nodes { id, title } } } }
    auth: linear_key

transform:
  type: table
  columns: [title, state, assignee, updated_at]
  sort_by: updated_at
  limit: 20

dispatch:
  type: slack
  channel: "#engineering"
  format: blockit
```

## Status

- **Priority:** P1 (multi-project integration)
- **Effort:** 8 hours (full framework)
- **Target:** 2026-04-02
- **Status:** Framework spec → Phase 1 implementation pending
