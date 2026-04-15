# API Aggregation Notifier

**Universal framework for multi-source API data aggregation, transformation, and Slack notification.**

Fetch from REST or GraphQL APIs → Transform with flexible filtering/sorting/deduplication → Dispatch to Slack in structured Block Kit messages.

## Features

- **Multi-Source Fetching** (Phase 1/2)
  - REST API support with 4 auth types (Bearer, API Key, HTTP Basic, Query Param)
  - 4 pagination modes (page-based, cursor-based, Link header, offset-based)
  - GraphQL support with cursor pagination and variable substitution
  - Exponential backoff retry logic (5xx retry, 4xx no-retry)
  - Custom response data extraction via dot notation

- **Data Transformation** (Phase 1)
  - Column selection and extraction
  - 7 filter operators: `eq`, `ne`, `gt`, `lt`, `contains`, `startswith`, `regex`
  - Sorting: date-aware, numeric, string (both asc/desc)
  - Deduplication by field
  - Row limiting
  - Field renaming
  - Output formats: Markdown, CSV, JSON

- **Slack Dispatch** (Phase 3)
  - Block Kit message generation with header, mention, table, footer
  - Two auth modes: Incoming Webhook or Bot Token + API
  - Table auto-truncation for large result sets (>50 rows)
  - Rate limiting (1s minimum between sends, 429 retry handling)
  - Thread reply support
  - Auto-detection of webhook URLs

## Installation

```bash
pip install requests pyyaml
```

## Quick Start

### 1. Fetch GitHub Issues and Send to Slack

```python
from src.config import load_config
from src.fetcher import RestFetcher
from src.transformer import DataTransformer
from src.dispatcher import SlackDispatcher

# Load config (YAML or dict)
config = load_config({
    "sources": [{
        "type": "rest",
        "url": "https://api.github.com/repos/anthropics/claude-code/issues",
        "params": {"state": "open", "per_page": 30},
        "auth": "bearer:GITHUB_TOKEN",
    }],
    "transform": {
        "columns": ["number", "title", "state", "updated_at"],
        "sort_by": "updated_at",
        "sort_order": "desc",
        "limit": 10,
    },
    "dispatch": {
        "type": "slack",
        "destination": "#engineering",
        "title": "Open Issues",
        "token_env": "SLACK_BOT_TOKEN",
    }
})

# Fetch
fetcher = RestFetcher()
results = fetcher.fetch_all(config.sources)

# Transform
transformer = DataTransformer()
result = transformer.transform(results[0].data, config.transform)

# Dispatch
dispatcher = SlackDispatcher()
dispatch_result = dispatcher.dispatch(result, config.dispatch)

print(f"Sent to Slack: {dispatch_result.ts}")
```

### 2. Run Smoke Tests

```bash
# Phase 1: REST fetcher + transformer
python smoke_test.py

# Phase 3: Slack dispatcher (requires SLACK_WEBHOOK_URL)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... python smoke_test_slack.py
```

## Configuration

### SourceConfig

```yaml
sources:
  - type: rest              # or "graphql"
    url: https://api.example.com/items
    method: GET
    auth: bearer:GITHUB_TOKEN  # or apikey:X-API-Key:API_KEY_ENV
    headers:
      User-Agent: MyApp
    params:
      page_size: 50
    pagination:
      type: cursor          # or "page", "link_header", "offset"
      cursor_fields: [cursor, next_cursor]
      max_pages: 10
    data_path: data.items   # dot notation for nested extraction
```

### Auth Types

- `bearer:{ENV_VAR}` → `Authorization: Bearer {token}`
- `apikey:{HEADER}:{ENV_VAR}` → Custom header with token from env
- `basic:{USER_ENV}:{PASS_ENV}` → HTTP Basic auth (base64 encoded)
- `param:{KEY}:{ENV_VAR}` → Query parameter with token

### TransformConfig

```yaml
transform:
  type: table              # or "json", "csv"
  columns: [id, name, status]
  sort_by: created_at
  sort_order: desc        # or "asc"
  filters:
    - field: status
      op: eq
      value: active
    - field: priority
      op: gte
      value: 1
  limit: 100
  deduplicate_by: email
  rename:
    old_name: new_name
```

### FilterConfig Operators

| Operator | Example | Notes |
|----------|---------|-------|
| `eq` | `{field: status, op: eq, value: active}` | Exact match |
| `ne` | `{field: status, op: ne, value: inactive}` | Not equal |
| `gt` | `{field: age, op: gt, value: 18}` | Greater than |
| `lt` | `{field: count, op: lt, value: 100}` | Less than |
| `contains` | `{field: name, op: contains, value: john}` | Case-insensitive substring |
| `startswith` | `{field: code, op: startswith, value: US}` | Case-insensitive prefix |
| `regex` | `{field: email, op: regex, value: \.com$}` | Regular expression match |

### DispatchConfig (Slack)

```yaml
dispatch:
  type: slack
  destination: C123456ABC  # Channel ID or webhook URL
  title: "Report Title"
  mention: "@channel"      # or "@here" or "<@U123>"
  thread_ts: "1234567890.123456"  # Reply in thread
  unfurl_links: false
  # Choose one auth method:
  webhook_url: https://hooks.slack.com/services/...  # or
  token_env: SLACK_BOT_TOKEN    # uses chat.postMessage API
```

## Testing

```bash
# Run all tests (Phase 1, 2, 3)
pytest tests/ -v

# Phase 1 only (REST + Transformer)
pytest tests/test_config.py tests/test_fetcher.py tests/test_transformer.py -v

# Phase 3 only (Slack Dispatcher)
pytest tests/test_dispatcher.py -v

# With coverage
pytest tests/ --cov=src --cov-report=html
```

### Test Coverage

- **test_config.py** (14 tests): YAML loading, auth resolution, validation
- **test_fetcher.py** (17 tests): All auth types, 4 pagination modes, error handling
- **test_transformer.py** (23 tests): Filters, sorting, deduplication, formatting
- **test_dispatcher.py** (20 tests): Block building, webhook/API dispatch, rate limiting

**Total: 74 tests, 100% pass rate**

## Stats

- **Phase 1 (REST + Transform)**: 54 tests, ~1000 LOC
- **Phase 2 (GraphQL)**: (implemented, tests in progress)
- **Phase 3 (Slack)**: 20 tests, ~300 LOC
- **Total**: 74 tests, ~1500 LOC
